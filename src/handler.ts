import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { findCustomerByDocument } from './customer-repository';
import { isValidCpf, normalizeCpf } from './cpf';
import { signCustomerToken } from './jwt';
import { loadConfig } from './config';

interface AuthRequestBody {
  cpf?: unknown;
}

function response(
  statusCode: number,
  body: Record<string, unknown>,
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * POST /auth/cpf
 *
 *   entrada  { "cpf": "529.982.247-25" }
 *   saída    { "accessToken": "...", "expiresIn": "15m", "customer": {...} }
 *
 * Valida o CPF, confirma que o cliente existe na base e devolve um JWT que a
 * API principal aceita nas rotas protegidas.
 */
export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const requestId = event.requestContext?.requestId ?? 'local';

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    // Erro de configuração é problema nosso, não do cliente — não vaza detalhe.
    console.error(
      JSON.stringify({ level: 'error', requestId, msg: 'config inválida', error: String(error) }),
    );
    return response(500, { message: 'Internal server error' });
  }

  let body: AuthRequestBody;
  try {
    body = JSON.parse(event.body ?? '{}') as AuthRequestBody;
  } catch {
    return response(400, { message: 'Corpo da requisição não é um JSON válido' });
  }

  if (typeof body.cpf !== 'string' || body.cpf.trim() === '') {
    return response(400, { message: 'Campo "cpf" é obrigatório' });
  }

  if (!isValidCpf(body.cpf)) {
    console.warn(
      JSON.stringify({ level: 'warn', requestId, msg: 'CPF inválido' }),
    );
    // Não ecoamos o CPF recebido na resposta nem no log: é dado pessoal.
    return response(400, { message: 'CPF inválido' });
  }

  const document = normalizeCpf(body.cpf);

  let customer;
  try {
    customer = await findCustomerByDocument(config.databaseUrl, document);
  } catch (error) {
    console.error(
      JSON.stringify({ level: 'error', requestId, msg: 'falha ao consultar o banco', error: String(error) }),
    );
    return response(503, { message: 'Serviço temporariamente indisponível' });
  }

  if (!customer) {
    console.warn(
      JSON.stringify({ level: 'warn', requestId, msg: 'cliente não encontrado' }),
    );
    // 401 e não 404: responder "não existe" transformaria este endpoint num
    // oráculo para descobrir quais CPFs estão cadastrados na oficina.
    return response(401, { message: 'Cliente não encontrado ou inativo' });
  }

  const accessToken = signCustomerToken(
    {
      sub: customer.id,
      email: customer.email,
      role: 'CUSTOMER',
      name: customer.name,
      document: customer.document,
    },
    config.jwtSecret,
    config.jwtExpiresIn,
  );

  console.log(
    JSON.stringify({
      level: 'info',
      requestId,
      msg: 'token emitido',
      customerId: customer.id,
    }),
  );

  return response(200, {
    accessToken,
    expiresIn: config.jwtExpiresIn,
    customer: { id: customer.id, name: customer.name, email: customer.email },
  });
}
