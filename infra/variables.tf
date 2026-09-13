variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "sa-east-1"
}

variable "aws_profile" {
  description = "Named AWS CLI profile for local runs. Leave empty in CI, where credentials come from the environment."
  type        = string
  default     = ""
}

variable "project_name" {
  description = "Name prefix used to tag and name all resources"
  type        = string
  default     = "oficina-backend"
}

variable "state_bucket" {
  description = "S3 bucket holding the Terraform state of every infra repo"
  type        = string
  default     = "oficina-backend-tfstate-765465309229"
}

variable "jwt_secret" {
  description = "Shared HS256 secret. Leave empty to generate one; the same value must go into the app's Kubernetes Secret."
  type        = string
  default     = ""
  sensitive   = true
}

variable "jwt_expires_in" {
  description = "Lifetime of the customer access token issued by the Lambda"
  type        = string
  default     = "15m"
}

variable "log_retention_days" {
  description = "CloudWatch log retention. Kept short on purpose — logs are the main cost driver here."
  type        = number
  default     = 7
}

variable "throttling_rate_limit" {
  description = "Steady-state requests per second allowed by the API Gateway stage"
  type        = number
  default     = 50
}

variable "throttling_burst_limit" {
  description = "Burst capacity of the API Gateway stage"
  type        = number
  default     = 100
}
