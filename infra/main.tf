terraform {
  # 1.11+ é necessário para `use_lockfile` no backend S3 (lock nativo, sem DynamoDB).
  required_version = ">= 1.11.0"

  # Mesmo bucket dos outros repositórios de infraestrutura, chave própria.
  backend "s3" {
    bucket       = "oficina-backend-tfstate-765465309229"
    key          = "lambda/terraform.tfstate"
    region       = "sa-east-1"
    encrypt      = true
    use_lockfile = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "aws" {
  region = var.aws_region

  # Na máquina do dev autenticamos por profile nomeado; no GitHub Actions as
  # credenciais vêm de variáveis de ambiente e nenhum profile existe.
  profile = var.aws_profile != "" ? var.aws_profile : null

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
      Repo      = "oficina-lambda-auth"
    }
  }
}
