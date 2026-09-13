output "api_gateway_url" {
  description = "Public entry point of the whole system — use this instead of the node's IP"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "auth_endpoint" {
  description = "POST here with {\"cpf\": \"...\"} to get a customer token"
  value       = "${aws_apigatewayv2_stage.default.invoke_url}auth/cpf"
}

output "auth_lambda_name" {
  description = "Auth function name, for `aws logs tail`"
  value       = aws_lambda_function.auth.function_name
}

output "authorizer_lambda_name" {
  description = "Authorizer function name, for `aws logs tail`"
  value       = aws_lambda_function.authorizer.function_name
}

output "app_origin" {
  description = "Where the gateway forwards non-auth traffic"
  value       = local.app_origin
}

output "jwt_secret" {
  description = "Shared HS256 secret — this exact value must be in the app's Kubernetes Secret as JWT_SECRET. Read with `terraform output -raw jwt_secret`."
  value       = local.jwt_secret
  sensitive   = true
}
