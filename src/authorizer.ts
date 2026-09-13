import type {
  APIGatewayRequestSimpleAuthorizerHandlerV2WithContext,
  APIGatewaySimpleAuthorizerWithContextResult,
} from 'aws-lambda';
import { verifyToken } from './jwt';

interface AuthorizerContext extends Record<string, string> {
  customerId: string;
  role: string;
}

const DENY: APIGatewaySimpleAuthorizerWithContextResult<AuthorizerContext> = {
  isAuthorized: false,
  context: { customerId: '', role: '' },
};

/**
 * Lambda Authorizer das rotas sensíveis do API Gateway.
 *
 * Por que um authorizer customizado e não o JWT authorizer nativo do API
 * Gateway: o nativo só valida tokens assinados com chave assimétrica via
 * JWKS/OIDC (RS256). Nossos tokens são HS256, assinados com um segredo
 * simétrico compartilhado com a API — então a verificação precisa ser
 * nossa.
 *
 * A aplicação continua validando o token por conta própria. Isto aqui é uma
 * segunda barreira, na borda: tráfego sem token válido nem chega a consumir
 * um pod do cluster.
 *
 * Roda FORA da VPC de propósito — só verifica assinatura, não toca no banco,
 * e ficar fora evita o custo de ENI e o cold start maior.
 */
export const handler: APIGatewayRequestSimpleAuthorizerHandlerV2WithContext<
  AuthorizerContext
> = async (event) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error(JSON.stringify({ level: 'error', msg: 'JWT_SECRET ausente' }));
    return DENY;
  }

  const header =
    event.headers?.authorization ?? event.headers?.Authorization ?? '';

  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return DENY;
  }

  const payload = verifyToken(token, secret);
  if (!payload?.sub) {
    return DENY;
  }

  // Repassado para a aplicação nos headers da integração, útil em log/trace.
  return {
    isAuthorized: true,
    context: { customerId: payload.sub, role: payload.role ?? '' },
  };
};
