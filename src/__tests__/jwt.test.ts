import { signCustomerToken, verifyToken } from '../jwt';

const SECRET = 'segredo-de-teste';

const payload = {
  sub: 'customer-uuid',
  email: 'cliente@exemplo.com',
  role: 'CUSTOMER' as const,
  name: 'Cliente Teste',
  document: '52998224725',
};

describe('signCustomerToken / verifyToken', () => {
  it('emite um token que ele mesmo consegue verificar', () => {
    const token = signCustomerToken(payload, SECRET, '15m');
    expect(verifyToken(token, SECRET)).toMatchObject(payload);
  });

  it('inclui os três campos que a API exige', () => {
    // jwt.strategy.ts da aplicação rejeita token sem sub, email ou role.
    const decoded = verifyToken(signCustomerToken(payload, SECRET, '15m'), SECRET);
    expect(decoded?.sub).toBeTruthy();
    expect(decoded?.email).toBeTruthy();
    expect(decoded?.role).toBe('CUSTOMER');
  });

  it('rejeita token assinado com outro segredo', () => {
    const token = signCustomerToken(payload, 'outro-segredo', '15m');
    expect(verifyToken(token, SECRET)).toBeNull();
  });

  it('rejeita token expirado', () => {
    const token = signCustomerToken(payload, SECRET, '-1s');
    expect(verifyToken(token, SECRET)).toBeNull();
  });

  it('rejeita lixo', () => {
    expect(verifyToken('nao-e-um-jwt', SECRET)).toBeNull();
  });
});
