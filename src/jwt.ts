import * as jwt from 'jsonwebtoken';

/**
 * Formato do payload exigido pela API em
 * `oficina-backend/src/infrastructure/config/jwt.strategy.ts`: ela rejeita
 * qualquer token sem `sub`, `email` e `role`. Manter os três campos é o que
 * faz o token emitido aqui ser aceito pela aplicação sem alteração nenhuma
 * do lado dela.
 */
export interface CustomerJwtPayload {
  sub: string;
  email: string;
  role: 'CUSTOMER';
  name: string;
  document: string;
}

export function signCustomerToken(
  payload: CustomerJwtPayload,
  secret: string,
  expiresIn: string,
): string {
  // HS256 (default): a API valida o token com o mesmo segredo simétrico.
  return jwt.sign(payload, secret, {
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(
  token: string,
  secret: string,
): CustomerJwtPayload | null {
  try {
    return jwt.verify(token, secret) as CustomerJwtPayload;
  } catch {
    // Assinatura inválida, token expirado ou malformado — para o chamador
    // são todos o mesmo caso: não autorizado.
    return null;
  }
}
