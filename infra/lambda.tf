# ---------------------------------------------------------------------------
# Empacotamento
# ---------------------------------------------------------------------------
# `npm run build` gera dist/handler.js e dist/authorizer.js com esbuild. Cada
# um vira um zip próprio, para que uma mudança no handler não force redeploy
# do authorizer e vice-versa.

data "archive_file" "auth" {
  type        = "zip"
  source_file = "${path.module}/../dist/handler.js"
  output_path = "${path.module}/.build/handler.zip"
}

data "archive_file" "authorizer" {
  type        = "zip"
  source_file = "${path.module}/../dist/authorizer.js"
  output_path = "${path.module}/.build/authorizer.zip"
}

# ---------------------------------------------------------------------------
# IAM
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "auth" {
  name               = "${var.project_name}-lambda-auth-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "auth_basic" {
  role       = aws_iam_role.auth.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Necessário para a função criar a ENI que a coloca dentro da VPC.
resource "aws_iam_role_policy_attachment" "auth_vpc" {
  role       = aws_iam_role.auth.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role" "authorizer" {
  name               = "${var.project_name}-lambda-authorizer-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "authorizer_basic" {
  role       = aws_iam_role.authorizer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ---------------------------------------------------------------------------
# Rede da função de autenticação
# ---------------------------------------------------------------------------

resource "aws_security_group" "lambda" {
  name        = "${var.project_name}-lambda-auth-sg"
  description = "Auth Lambda - outbound to RDS only"
  vpc_id      = local.vpc_id

  egress {
    description = "Postgres no RDS"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/16"]
  }

  tags = {
    Name = "${var.project_name}-lambda-auth-sg"
  }
}

# Abre a 5432 do RDS para a Lambda. A regra mora aqui, e não no repositório
# do banco, porque é este repositório que cria o security group de origem —
# o de lá não tem como conhecê-lo sem inverter a dependência entre os states.
resource "aws_vpc_security_group_ingress_rule" "rds_from_lambda" {
  security_group_id            = local.rds_security_group_id
  description                  = "Postgres from the auth Lambda"
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.lambda.id
}

# ---------------------------------------------------------------------------
# Funções
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "auth" {
  name              = "/aws/lambda/${var.project_name}-auth-cpf"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "auth" {
  function_name    = "${var.project_name}-auth-cpf"
  role             = aws_iam_role.auth.arn
  filename         = data.archive_file.auth.output_path
  source_code_hash = data.archive_file.auth.output_base64sha256
  handler          = "handler.handler"
  runtime          = "nodejs20.x"
  timeout          = 15
  memory_size      = 256

  # Dentro da VPC para alcançar o RDS, que fica em subnet privada.
  vpc_config {
    subnet_ids         = local.private_subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      DATABASE_URL   = local.database_url
      JWT_SECRET     = local.jwt_secret
      JWT_EXPIRES_IN = var.jwt_expires_in
      NODE_OPTIONS   = "--enable-source-maps"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.auth_basic,
    aws_iam_role_policy_attachment.auth_vpc,
    aws_cloudwatch_log_group.auth,
  ]
}

resource "aws_cloudwatch_log_group" "authorizer" {
  name              = "/aws/lambda/${var.project_name}-authorizer"
  retention_in_days = var.log_retention_days
}

# Fica FORA da VPC de propósito: só verifica assinatura de JWT, não toca no
# banco. Sem ENI, o cold start é bem menor — e ele roda em toda requisição
# protegida.
resource "aws_lambda_function" "authorizer" {
  function_name    = "${var.project_name}-authorizer"
  role             = aws_iam_role.authorizer.arn
  filename         = data.archive_file.authorizer.output_path
  source_code_hash = data.archive_file.authorizer.output_base64sha256
  handler          = "authorizer.handler"
  runtime          = "nodejs20.x"
  timeout          = 5
  memory_size      = 128

  environment {
    variables = {
      JWT_SECRET = local.jwt_secret
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.authorizer_basic,
    aws_cloudwatch_log_group.authorizer,
  ]
}
