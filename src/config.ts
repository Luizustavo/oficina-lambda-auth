/**
 * Variáveis de ambiente da função, lidas num único lugar.
 *
 * DATABASE_URL e JWT_SECRET chegam como variáveis de ambiente da Lambda, e
 * não do SSM Parameter Store, por um motivo de rede: esta função roda dentro
 * da VPC para alcançar o RDS, e a VPC não tem NAT Gateway (removido para
 * cortar custo). Sem NAT, a Lambda não alcança o endpoint público do SSM, e
 * um VPC Endpoint para SSM custaria mais que o resto da infraestrutura junta.
 *
 * As variáveis de ambiente da Lambda são criptografadas em repouso com KMS.
 * O trade-off: ficam visíveis no console para quem tem IAM de leitura na
 * função. Registrado no ADR-004.
 */
export interface Config {
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    databaseUrl: required('DATABASE_URL'),
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  };
}
