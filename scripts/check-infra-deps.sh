#!/usr/bin/env bash
#
# Confere se os states dos repositorios de infraestrutura dos quais este
# depende ja existem no S3.
#
# Ordem de apply: oficina-infra-k8s -> oficina-infra-database -> este.
#
# Sai com 0 se tudo esta pronto, 1 se falta alguma coisa. Nao emite
# anotacao ::error:: de proposito: quem chama decide a severidade. O job de
# plan trata ausencia como "pular"; o de deploy, como erro.

set -uo pipefail

BUCKET="${STATE_BUCKET:-oficina-backend-tfstate-765465309229}"
faltando=()

for dep in k8s database; do
  if aws s3api head-object --bucket "$BUCKET" --key "$dep/terraform.tfstate" >/dev/null 2>&1; then
    echo "ok: $dep"
  else
    echo "ausente: $dep (s3://$BUCKET/$dep/terraform.tfstate)"
    faltando+=("$dep")
  fi
done

if [ ${#faltando[@]} -gt 0 ]; then
  echo
  echo "Rode o apply de: ${faltando[*]/#/oficina-infra-}"
  exit 1
fi
