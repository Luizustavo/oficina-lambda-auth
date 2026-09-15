# HTTP API (apigatewayv2) e não REST API (apigateway v1): mesma capacidade
# para o que precisamos aqui, com latência menor e custo ~70% mais baixo.

resource "aws_apigatewayv2_api" "main" {
  name          = "${var.project_name}-api"
  description   = "Porta de entrada pública: autenticação por CPF e proxy para a aplicação no k3s"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["content-type", "authorization"]
    max_age       = 300
  }
}

# ---------------------------------------------------------------------------
# Integrações
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "auth_lambda" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.auth.invoke_arn
  payload_format_version = "2.0"
}

# Encaminha para o NodePort da aplicação no nó k3s. Não há Load Balancer no
# meio: o k3s puro não provisiona ELB, então o gateway fala direto com o IP
# elástico do nó (ver o repositório oficina-infra-k8s).
#
# O caminho é repassado com `overwrite:path = $request.path`, e não montado
# com `{proxy}` na URI. A diferença importa: numa rota específica como
# `ANY /api/health/{proxy+}`, a variável {proxy} captura apenas o trecho
# DEPOIS do prefixo — `/api/health/live` viraria {proxy}="live" e a aplicação
# receberia `/live`, respondendo 404. `$request.path` carrega sempre o
# caminho original inteiro, valendo igual para todas as rotas.
resource "aws_apigatewayv2_integration" "app_proxy" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = local.app_origin
  payload_format_version = "1.0"

  request_parameters = {
    "overwrite:path" = "$request.path"
  }
}

resource "aws_lambda_permission" "auth_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# Authorizer
# ---------------------------------------------------------------------------
# Authorizer customizado em vez do JWT authorizer nativo porque o nativo só
# aceita chave assimétrica via JWKS/OIDC (RS256), e nossos tokens são HS256
# assinados com o segredo compartilhado com a aplicação.

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id                            = aws_apigatewayv2_api.main.id
  name                              = "${var.project_name}-jwt-authorizer"
  authorizer_type                   = "REQUEST"
  authorizer_uri                    = aws_lambda_function.authorizer.invoke_arn
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = true
  identity_sources                  = ["$request.header.Authorization"]
  # Cacheia a decisão por token durante 5 min, evitando invocar o authorizer
  # em toda requisição de uma mesma sessão.
  authorizer_result_ttl_in_seconds = 300
}

resource "aws_lambda_permission" "authorizer_invoke" {
  statement_id  = "AllowAPIGatewayInvokeAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/authorizers/${aws_apigatewayv2_authorizer.jwt.id}"
}

# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------
# No HTTP API a rota mais específica ganha da mais genérica, então as rotas
# públicas abaixo têm precedência sobre o ANY /{proxy+} protegido.

# Autenticação por CPF — pública, é ela que emite o token.
resource "aws_apigatewayv2_route" "auth_cpf" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /auth/cpf"
  target    = "integrations/${aws_apigatewayv2_integration.auth_lambda.id}"
}

# Rotas que precisam ficar abertas: healthcheck (Kubernetes e monitoração),
# Swagger (avaliação) e o login de usuário interno da própria aplicação.
locals {
  # Cada prefixo precisa das duas formas: com sub-caminho e exato. Sem a
  # exata, `GET /api/docs` (a raiz do Swagger) cairia no ANY /{proxy+}
  # protegido e responderia 401 em vez de abrir a documentação.
  public_routes = {
    health      = "ANY /api/health/{proxy+}"
    health_raiz = "ANY /api/health"
    docs        = "ANY /api/docs/{proxy+}"
    docs_raiz   = "ANY /api/docs"
    # O Swagger UI busca a especificação nestes dois endpoints. Sem eles a
    # página abre, mas não consegue renderizar a documentação.
    docs_json = "ANY /api/docs-json"
    docs_yaml = "ANY /api/docs-yaml"
    auth      = "ANY /api/auth/{proxy+}"
    auth_raiz = "ANY /api/auth"
  }
}

resource "aws_apigatewayv2_route" "public" {
  for_each = local.public_routes

  api_id    = aws_apigatewayv2_api.main.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.app_proxy.id}"
}

# Todo o resto é sensível: exige token válido já na borda. A aplicação
# continua validando por conta própria — isto é uma segunda barreira, que
# impede tráfego não autenticado de sequer chegar ao cluster.
resource "aws_apigatewayv2_route" "protected" {
  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "ANY /{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.app_proxy.id}"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

# ---------------------------------------------------------------------------
# Stage
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/apigateway/${var.project_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  # Log estruturado em JSON, com requestId — é o que permite correlacionar
  # uma requisição na borda com o trace dela dentro da aplicação.
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    format = jsonencode({
      requestId        = "$context.requestId"
      requestTime      = "$context.requestTime"
      httpMethod       = "$context.httpMethod"
      path             = "$context.path"
      routeKey         = "$context.routeKey"
      status           = "$context.status"
      responseLatency  = "$context.responseLatency"
      integrationError = "$context.integrationErrorMessage"
      authorizerError  = "$context.authorizer.error"
      sourceIp         = "$context.identity.sourceIp"
    })
  }

  default_route_settings {
    throttling_burst_limit = var.throttling_burst_limit
    throttling_rate_limit  = var.throttling_rate_limit
  }
}
