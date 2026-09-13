import { isValidCpf, normalizeCpf } from '../cpf';

describe('normalizeCpf', () => {
  it('remove pontuação', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
  });

  it('deixa passar string já limpa', () => {
    expect(normalizeCpf('52998224725')).toBe('52998224725');
  });
});

describe('isValidCpf', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])(
    'aceita CPF válido: %s',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(true);
    },
  );

  it('rejeita dígito verificador errado', () => {
    expect(isValidCpf('52998224726')).toBe(false);
  });

  it('rejeita CPF com todos os dígitos iguais', () => {
    // Estes passam na conta dos dígitos verificadores, mas não são válidos.
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('00000000000')).toBe(false);
  });

  it.each(['', '123', '529982247250', 'abcdefghijk'])(
    'rejeita entrada malformada: %s',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(false);
    },
  );
});
