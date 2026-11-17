# Este repositório é o terceiro da cadeia: precisa da rede (repo de k8s) para
# colocar a Lambda dentro da VPC, e do banco (repo de database) para a
# connection string e para liberar a porta 5432 no security group do RDS.
#
# Ordem de apply:   k8s -> database -> lambda
# Ordem de destroy: lambda -> database -> k8s

data "terraform_remote_state" "k8s" {
  backend = "s3"

  config = {
    bucket = var.state_bucket
    key    = "k8s/terraform.tfstate"
    region = var.aws_region
  }
}

data "terraform_remote_state" "database" {
  backend = "s3"

  config = {
    bucket = var.state_bucket
    key    = "database/terraform.tfstate"
    region = var.aws_region
  }
}

locals {
  vpc_id             = data.terraform_remote_state.k8s.outputs.vpc_id
  private_subnet_ids = data.terraform_remote_state.k8s.outputs.private_subnet_ids
  k3s_public_ip      = data.terraform_remote_state.k8s.outputs.k3s_instance_public_ip
  k3s_node_port      = 30080

  rds_security_group_id = data.terraform_remote_state.database.outputs.rds_security_group_id
  database_url          = data.terraform_remote_state.database.outputs.database_url

  # A Lambda não usa a conta mestre: entra como auth_reader, que só lê id, name,
  # email e document de customers (ADR-014). O usuário é criado pelo job de
  # bootstrap do oficina-backend com a senha do output auth_reader_password.
  auth_reader_password = var.auth_reader_password != "" ? var.auth_reader_password : random_password.auth_reader.result
  auth_database_url    = replace(local.database_url, "/\\/\\/[^@]+@/", "//auth_reader:${local.auth_reader_password}@")

  # Onde o API Gateway encaminha tudo que não for a rota de autenticação.
  app_origin = "http://${local.k3s_public_ip}:${local.k3s_node_port}"

  # Se jwt_secret não for informado, geramos um. Nos dois casos o mesmo valor
  # precisa estar no Secret do Kubernetes da aplicação — ver README.
  jwt_secret = var.jwt_secret != "" ? var.jwt_secret : random_password.jwt_secret.result
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "auth_reader" {
  length  = 32
  special = false
}
