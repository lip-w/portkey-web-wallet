export const LOGIN_CONFIG = {
  MAINNET: {
    connectUrl: 'https://auth-aa-portkey.portkey.finance',
    loginConfig: {
      loginMethodsOrder: ['Email', 'Telegram', 'Google', 'Apple', 'Scan'],
      recommendIndexes: [0, 2],
    },
    requestDefaults: {
      timeout: 30000,
      baseURL: 'https://aa-portkey.portkey.finance',
    },
    serviceUrl: 'https://aa-portkey.portkey.finance',
    graphQLUrl: 'https://indexer-api.aefinder.io/api/app/graphql/portkey',
    eTransferCA: {
      AELF: '2w13DqbuuiadvaSY2ZyKi2UoXg354zfHLM3kwRKKy85cViw4ZF',
      tDVV: 'x4CTSuM8typUbpdfxRZDTqYVa42RdxrwwPkXX7WUJHeRmzE6k',
    },
    eTransferUrl: 'https://app.etransfer.exchange',
  },
  TESTNET: {
    connectUrl: 'https://auth-aa-portkey-test.portkey.finance',
    loginConfig: {
      loginMethodsOrder: ['Email', 'Telegram', 'Google', 'Apple', 'Scan'],
      recommendIndexes: [0, 2],
    },
    requestDefaults: {
      timeout: 30000,
      baseURL: 'https://aa-portkey-test.portkey.finance',
    },
    serviceUrl: 'https://aa-portkey-test.portkey.finance',
    graphQLUrl: 'https://test-indexer-api.aefinder.io/api/app/graphql/portkey',
    eTransferCA: {
      AELF: '4xWFvoLvi5anZERDuJvzfMoZsb6WZLATEzqzCVe8sQnCp2XGS',
      tDVW: '2AgU8BfyKyrxUrmskVCUukw63Wk96MVfVoJzDDbwKszafioCN1',
    },
    eTransferUrl: 'https://test-app.etransfer.exchange',
  },
} as const;
