/**
 * Validação de CPF (dígitos verificadores).
 *
 * Duplicada de propósito a partir de
 * `oficina-backend/src/domain/validators/value-objects/cpf.value-object.ts`.
 * Os dois repositórios são deployados de forma independente, e criar um
 * pacote compartilhado só para 30 linhas de algoritmo — que não muda,
 * porque é definido pela Receita Federal — custaria mais do que resolve.
 * Decisão registrada no ADR-006.
 */

/** Remove tudo que não for dígito. `123.456.789-09` vira `12345678909`. */
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

export function isValidCpf(cpf: string): boolean {
  const cleaned = normalizeCpf(cpf);

  if (cleaned.length !== 11) return false;
  // Rejeita 00000000000, 11111111111, etc.: passam na conta dos dígitos
  // verificadores, mas não são CPFs válidos.
  if (/^(\d)\1{10}$/.test(cleaned)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(cleaned[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== Number(cleaned[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(cleaned[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== Number(cleaned[10])) return false;

  return true;
}
