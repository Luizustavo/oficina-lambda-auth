#!/usr/bin/env bash
#
# Confere se a cadeia de infraestrutura da qual este repositorio depende esta
# de fato provisionada.
#
# Ordem de apply: oficina-infra-k8s -> oficina-infra-database -> este.
#
# Nao basta o arquivo de state existir: depois de um `terraform destroy` ele
# continua no bucket, porem com zero recursos e zero outputs. Checar so a
# existencia daria falso positivo e o Terraform quebraria adiante com um
# "Unable to find remote state output", que e exatamente o erro obscuro que
# esta checagem existe para evitar. Por isso validamos os outputs que este
# repositorio realmente consome.
#
# Sai 0 se tudo pronto, 1 se falta algo. Nao emite anotacao ::error:: de
# proposito: quem chama decide a severidade. O job de plan trata ausencia
# como "pular"; o de deploy, como erro.

set -uo pipefail

BUCKET="${STATE_BUCKET:-oficina-backend-tfstate-765465309229}"
faltando=()

# Outputs lidos em infra/data.tf
declare -A NECESSARIOS=(
  [k8s]="vpc_id private_subnet_ids k3s_instance_public_ip"
  [database]="rds_security_group_id database_url"
)

for dep in k8s database; do
  estado=$(aws s3 cp "s3://${BUCKET}/${dep}/terraform.tfstate" - 2>/dev/null) || {
    echo "ausente: ${dep} — nenhum state em s3://${BUCKET}/${dep}/terraform.tfstate"
    faltando+=("$dep"); continue
  }

  incompleto=""
  for saida in ${NECESSARIOS[$dep]}; do
    if ! printf '%s' "$estado" | jq -e --arg o "$saida" '.outputs[$o] // empty' >/dev/null 2>&1; then
      incompleto="$saida"; break
    fi
  done

  if [ -n "$incompleto" ]; then
    echo "incompleto: ${dep} — state existe mas nao expoe o output '${incompleto}' (infraestrutura destruida?)"
    faltando+=("$dep")
  else
    echo "ok: ${dep}"
  fi
done

if [ ${#faltando[@]} -gt 0 ]; then
  echo
  echo "Rode o apply, nesta ordem, de: ${faltando[*]/#/oficina-infra-}"
  exit 1
fi
