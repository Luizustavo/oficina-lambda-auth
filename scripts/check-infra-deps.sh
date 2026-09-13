#!/usr/bin/env bash
#
# Confere que os states dos repositorios de infraestrutura dos quais este
# depende ja existem no S3. Sem isso, o Terraform falha la na frente com um
# "Unable to find remote state", que nao diz o que fazer.
#
# Ordem de apply: oficina-infra-k8s -> oficina-infra-database -> este.

set -euo pipefail

BUCKET="${STATE_BUCKET:-oficina-backend-tfstate-765465309229}"

for dep in k8s database; do
  if ! aws s3api head-object --bucket "$BUCKET" --key "$dep/terraform.tfstate" >/dev/null 2>&1; then
    echo "::error::State '$dep' nao encontrado em s3://$BUCKET/$dep/terraform.tfstate. Rode o apply de oficina-infra-$dep primeiro."
    exit 1
  fi
  echo "ok: $dep"
done
