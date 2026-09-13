import { Pool } from 'pg';

export interface Customer {
  id: string;
  name: string;
  email: string;
  document: string;
}

/**
 * O Pool vive fora do handler de propósito: a Lambda reaproveita o mesmo
 * contexto de execução entre invocações próximas, então a conexão sobrevive
 * e só a primeira chamada paga o custo de abrir socket + TLS contra o RDS.
 */
let pool: Pool | undefined;

export function getPool(databaseUrl: string): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      // O RDS exige TLS, mas o certificado dele não está na trust store do
      // Node. Sem rejectUnauthorized:false a conexão falha na verificação —
      // é a mesma razão do `?sslmode=no-verify` que a aplicação usa.
      ssl: { rejectUnauthorized: false },
      // A Lambda morre rápido; não vale segurar conexão ociosa no RDS,
      // que é um db.t4g.micro com poucas conexões disponíveis.
      max: 1,
      idleTimeoutMillis: 5000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

/** Só para os testes: descarta o pool memoizado entre casos. */
export function resetPool(): void {
  pool = undefined;
}

export async function findCustomerByDocument(
  databaseUrl: string,
  document: string,
): Promise<Customer | null> {
  const result = await getPool(databaseUrl).query<Customer>(
    'SELECT id, name, email, document FROM customers WHERE document = $1 LIMIT 1',
    [document],
  );
  return result.rows[0] ?? null;
}
