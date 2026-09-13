import type { APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda';
import { signCustomerToken } from '../jwt';
import { handler } from '../authorizer';

const SECRET = 'segredo-de-teste';

const payload = {
  sub: 'customer-uuid',
  email: 'cliente@exemplo.com',
  role: 'CUSTOMER' as const,
  name: 'Cliente Teste',
  document: '52998224725',
};

function event(headers: Record<string, string>): APIGatewayRequestAuthorizerEventV2 {
  return { headers } as unknown as APIGatewayRequestAuthorizerEventV2;
}

// O tipo do handler declara callback opcional; nos testes chamamos só com o
// evento e tratamos o retorno como promise.
const invoke = (headers: Record<string, string>) =>
  (handler as unknown as (
    e: APIGatewayRequestAuthorizerEventV2,
  ) => Promise<{ isAuthorized: boolean; context: Record<string, string> }>)(
    event(headers),
  );

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  process.env.JWT_SECRET = SECRET;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Lambda authorizer', () => {
  it('autoriza token válido e repassa o customerId', async () => {
    const token = signCustomerToken(payload, SECRET, '15m');
    const res = await invoke({ authorization: `Bearer ${token}` });
    expect(res.isAuthorized).toBe(true);
    expect(res.context.customerId).toBe('customer-uuid');
  });

  it('aceita o header com A maiúsculo', async () => {
    const token = signCustomerToken(payload, SECRET, '15m');
    const res = await invoke({ Authorization: `Bearer ${token}` });
    expect(res.isAuthorized).toBe(true);
  });

  it('nega token assinado com outro segredo', async () => {
    const token = signCustomerToken(payload, 'outro', '15m');
    expect((await invoke({ authorization: `Bearer ${token}` })).isAuthorized).toBe(false);
  });

  it('nega token expirado', async () => {
    const token = signCustomerToken(payload, SECRET, '-1s');
    expect((await invoke({ authorization: `Bearer ${token}` })).isAuthorized).toBe(false);
  });

  it.each([
    ['header ausente', {}],
    ['sem esquema Bearer', { authorization: 'abc' }],
    ['esquema errado', { authorization: 'Basic abc' }],
    ['Bearer sem token', { authorization: 'Bearer ' }],
  ])('nega quando %s', async (_label, headers) => {
    expect((await invoke(headers as Record<string, string>)).isAuthorized).toBe(false);
  });

  it('nega quando JWT_SECRET não está configurado', async () => {
    delete process.env.JWT_SECRET;
    const token = signCustomerToken(payload, SECRET, '15m');
    expect((await invoke({ authorization: `Bearer ${token}` })).isAuthorized).toBe(false);
  });
});
