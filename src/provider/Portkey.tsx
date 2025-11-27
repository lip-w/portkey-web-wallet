'use client';
import { ConfigProvider, NetworkType, PortkeyProvider, ThemeType } from '@portkey/did-ui-react';
import { ReactNode, useEffect, useState } from 'react';
import '@portkey/did-ui-react/dist/assets/index.css';
import qs from 'qs';
import { LOGIN_CONFIG } from '@/constants/config';
import { IWalletOptions } from '@/context/WalletProvider/actions';

export default function Portkey({ children }: { children?: ReactNode }) {
  const [config, setConfig] = useState<{ network: NetworkType; theme: ThemeType }>({
    theme: 'dark',
    network: 'MAINNET',
  });

  useEffect(() => {
    const options = qs.parse(window.location.search.replace('?', '')) as unknown as IWalletOptions;

    const networkType = (options.networkType ?? 'MAINNET') as keyof typeof LOGIN_CONFIG;
    setConfig({ network: networkType, theme: options.theme || 'dark' });

    const _config = {
      ...LOGIN_CONFIG[networkType],
      theme: options.theme,
      loginConfig: options.loginConfig,
    } as const;

    ConfigProvider.setGlobalConfig(_config);
  }, []);

  return (
    <PortkeyProvider networkType={config?.network} theme={config.theme}>
      {children}
    </PortkeyProvider>
  );
}
