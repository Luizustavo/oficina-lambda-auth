const mockQuery = jest.fn();
const mockPoolCtor = jest.fn();

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation((config: unknown) => {
    mockPoolCtor(config);
    return { query: mockQuery };
  }),
}));

import { findCustomerByDocument, getPool, resetPool } from '../customer-repository';

const URL = 'postgresql://u:p@host:5432/db';

const CUSTOMER = {
  id: 'customer-uuid',
  name: 'Cliente Teste',
  email: 'cliente@exemplo.com',
  document: '52998224725',
};

beforeEach(() => {
  jest.clearAllMocks();
  resetPool();
});

describe('getPool', () => {
  it('reaproveita o mesmo pool entre chamadas', () => {
    // A Lambda reusa o contexto de execução; abrir um pool por invocação
    // esgotaria as conexões do db.t4g.micro.
    const first = getPool(URL);
    const second = getPool(URL);
    expect(first).toBe(second);
    expect(mockPoolCtor).toHaveBeenCalledTimes(1);
  });

  it('configura TLS sem verificar o certificado do RDS', () => {
    getPool(URL);
    expect(mockPoolCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: URL,
        ssl: { rejectUnauthorized: false },
        max: 1,
      }),
    );
  });
});

describe('findCustomerByDocument', () => {
  it('devolve o cliente quando existe', async () => {
    mockQuery.mockResolvedValue({ rows: [CUSTOMER] });
    await expect(findCustomerByDocument(URL, '52998224725')).resolves.toEqual(CUSTOMER);
  });

  it('devolve null quando não existe', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(findCustomerByDocument(URL, '52998224725')).resolves.toBeNull();
  });

  it('usa query parametrizada, nunca concatenação', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await findCustomerByDocument(URL, "52998224725' OR '1'='1");

    const [sql, params] = mockQuery.mock.calls[0] as [string, string[]];
    expect(sql).toContain('WHERE document = $1');
    expect(params).toEqual(["52998224725' OR '1'='1"]);
    // O valor não pode aparecer interpolado no SQL.
    expect(sql).not.toContain("OR '1'='1");
  });

  it('propaga falha do banco para o chamador tratar', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));
    await expect(findCustomerByDocument(URL, '52998224725')).rejects.toThrow(
      'connection refused',
    );
  });
});
