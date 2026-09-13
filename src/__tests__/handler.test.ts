import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

// Precisa vir antes do import do handler: ele importa o repositório no topo.
jest.mock('../customer-repository', () => ({
  findCustomerByDocument: jest.fn(),
}));

import { findCustomerByDocument } from '../customer-repository';
import { verifyToken } from '../jwt';
import { handler } from '../handler';

const mockFind = findCustomerByDocument as jest.MockedFunction<
  typeof findCustomerByDocument
>;

const SECRET = 'segredo-de-teste';

const CUSTOMER = {
  id: 'customer-uuid',
  name: 'Cliente Teste',
  email: 'cliente@exemplo.com',
  document: '52998224725',
};

function event(body: unknown): APIGatewayProxyEventV2 {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    requestContext: { requestId: 'req-1' },
  } as APIGatewayProxyEventV2;
}

async function call(body: unknown) {
  return (await handler(event(body))) as APIGatewayProxyStructuredResultV2;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/db';
  process.env.JWT_SECRET = SECRET;
  process.env.JWT_EXPIRES_IN = '15m';
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('POST /auth/cpf', () => {
  it('devolve um token válido para cliente existente', async () => {
    mockFind.mockResolvedValue(CUSTOMER);

    const res = await call({ cpf: '529.982.247-25' });
    expect(res.statusCode).toBe(200);

    const parsed = JSON.parse(res.body as string);
    expect(parsed.customer).toEqual({
      id: CUSTOMER.id,
      name: CUSTOMER.name,
      email: CUSTOMER.email,
    });

    const decoded = verifyToken(parsed.accessToken, SECRET);
    expect(decoded).toMatchObject({
      sub: CUSTOMER.id,
      email: CUSTOMER.email,
      role: 'CUSTOMER',
    });
  });

  it('consulta o banco com o CPF sem pontuação', async () => {
    mockFind.mockResolvedValue(CUSTOMER);
    await call({ cpf: '529.982.247-25' });
    expect(mockFind).toHaveBeenCalledWith(expect.any(String), '52998224725');
  });

  it('rejeita CPF inválido sem tocar no banco', async () => {
    const res = await call({ cpf: '111.111.111-11' });
    expect(res.statusCode).toBe(400);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('exige o campo cpf', async () => {
    expect((await call({})).statusCode).toBe(400);
    expect((await call({ cpf: '' })).statusCode).toBe(400);
    expect((await call({ cpf: 12345678909 })).statusCode).toBe(400);
  });

  it('rejeita corpo que não é JSON', async () => {
    expect((await call('nao-e-json')).statusCode).toBe(400);
  });

  it('responde 401 quando o cliente não existe', async () => {
    mockFind.mockResolvedValue(null);
    const res = await call({ cpf: '529.982.247-25' });
    // 401 e não 404, para o endpoint não virar um oráculo de CPFs cadastrados.
    expect(res.statusCode).toBe(401);
  });

  it('não revela na resposta se o CPF existe ou não', async () => {
    mockFind.mockResolvedValue(null);
    const naoExiste = await call({ cpf: '529.982.247-25' });
    expect(JSON.parse(naoExiste.body as string).message).toBe(
      'Cliente não encontrado ou inativo',
    );
  });

  it('responde 503 quando o banco falha', async () => {
    mockFind.mockRejectedValue(new Error('connection refused'));
    const res = await call({ cpf: '529.982.247-25' });
    expect(res.statusCode).toBe(503);
  });

  it('responde 500 quando falta configuração', async () => {
    delete process.env.JWT_SECRET;
    const res = await call({ cpf: '529.982.247-25' });
    expect(res.statusCode).toBe(500);
  });
});
