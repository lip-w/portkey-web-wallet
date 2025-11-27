import { IDappManager } from '../../types/dapp';
import { CheckManagerParams, DIDWallet } from '@portkey/did';
import { portkey } from '@portkey/accounts';
import { did, getChain } from '@portkey/did-ui-react';
import { ChainInfo, GetCAHolderByManagerParams } from '@portkey/services';
import { wallet as walletUtils } from '@portkey/utils';
import { Accounts, ChainId, ChainsInfo } from '@portkey/provider-types';
import { getChainInfoMap } from '../chainInfo';
import { getWebWalletStorageKey } from '../wallet';
import { addressFormat } from '../account';
export interface IBaseDappManagerProps {
  pin: string;
}

export abstract class DappManager implements IDappManager {
  protected appId: string;

  constructor({ appId }: { appId: string }) {
    this.appId = appId;
  }
  protected AAInfo?: { caHash: string; caAddress: string; chainId: ChainId }[];
  caHash(): string {
    const currentAAInfo = this.getAAInfo();
    return currentAAInfo.accountInfo?.caHash || '';
  }
  getDid() {
    return did;
  }
  isActive(): boolean {
    return true;
  }

  async lockWallet() {
    return this.getDid().reset();
  }
  isLocked(): boolean {
    return Boolean(!did?.didWallet?.aaInfo?.accountInfo?.caHash);
  }

  isLogged() {
    return Boolean(localStorage.getItem(getWebWalletStorageKey(this.appId)));
  }

  getWallet() {
    return this.getDid()?.didWallet as unknown as DIDWallet<portkey.WalletAccount>;
  }

  async walletName(): Promise<string> {
    const wallet = this.getWallet();
    const originChainId = await this.getOriginChainId();
    const result = await wallet.getCAHolderInfo(originChainId);

    return result?.nickName;
  }

  async walletAvatar() {
    const wallet = this.getWallet();
    const originChainId = await this.getOriginChainId();
    const result = await wallet.getCAHolderInfo(originChainId);
    // TODO: update sdk version
    return result?.avatar;
  }

  async currentManagerAddress(): Promise<string | undefined> {
    return this.getWallet()?.managementAccount?.address;
  }

  getAAInfo() {
    const wallet = this.getWallet();
    return wallet.aaInfo;
  }

  async getChainInfo(chainId: ChainId): Promise<ChainInfo | undefined> {
    return getChain(chainId);
  }

  // async updateManagerSyncState(chainId: ChainId) {
  //   const { currentNetwork } = await this.getWallet();
  //   this.store.dispatch(updateCASyncState({ networkType: currentNetwork, chainId }));
  // }

  async walletInfo() {
    const wallet = this.getWallet();

    return {
      caHash: wallet?.aaInfo?.accountInfo?.caHash,
      caAddress: wallet?.aaInfo?.accountInfo?.caAddress,
      nickName: wallet?.aaInfo?.nickName,
      managerAddress: wallet?.managementAccount?.wallet?.address,
      managerPubkey: wallet?.managementAccount?.wallet?.keyPair.getPublic('hex'),
      originChainId: wallet?.originChainId,
    };
  }

  async getHolderInfoByManager() {
    const wallet = this.getWallet();
    if (this.AAInfo && this.AAInfo.length >= 2) return this.AAInfo;
    if (!wallet.managementAccount?.address && !wallet.aaInfo.accountInfo?.caHash) return [];
    const res = await did.services.getHolderInfoByManager({
      manager: wallet.managementAccount?.address,
      caHash: wallet.aaInfo.accountInfo?.caHash,
      maxResultCount: 2,
      // chainId: wallet.originChainId,
    } as unknown as GetCAHolderByManagerParams);

    return res
      .filter(item => item.caAddress)
      .map(item => ({
        caHash: item.caHash as string,
        caAddress: item.caAddress as string,
        chainId: item.chainId as ChainId,
      }));
  }

  async getOriginChainId() {
    const wallet = await this.getWallet();
    let originChainId = wallet.originChainId;
    if (originChainId) return originChainId;
    const res = await this.getHolderInfoByManager();
    const caInfo = res[0];
    originChainId = caInfo?.chainId as ChainId;
    return originChainId;
  }

  async accounts() {
    const chains = await this.chainIds();
    const caAddress = (await this.getAAInfo()).accountInfo?.caAddress;
    const accountsMap: Accounts = {};
    if (caAddress) {
      chains.forEach(item => {
        accountsMap[item] = [addressFormat(caAddress, item)];
      });
    } else {
      const res = await this.getHolderInfoByManager();
      res
        .filter(item => !!item.chainId)
        .forEach(item => {
          accountsMap[item.chainId] = [
            addressFormat(walletUtils.removeELFAddressSuffix(item.caAddress as string), item.chainId),
          ];
        });
    }
    return accountsMap;
  }

  async chainId() {
    return this.chainIds();
  }
  async chainIds() {
    const chainsInfo = await this.chainsInfo();
    return Object.keys(chainsInfo) as ChainId[];
  }
  async chainsInfo() {
    const chainsInfo: ChainsInfo = {};
    Object.values(await getChainInfoMap())?.forEach(chainInfo => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tmpChainInfo: any = { ...chainInfo };
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      tmpChainInfo.lastModifyTime && delete tmpChainInfo.lastModifyTime;
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      tmpChainInfo.id && delete tmpChainInfo.id;
      chainsInfo[chainInfo.chainId] = [tmpChainInfo];
    });
    return chainsInfo;
  }
  async getRpcUrl(chainId: ChainId): Promise<string | undefined> {
    return (await this.getChainInfo(chainId))?.endPoint;
  }

  async checkManagerIsExist(props: CheckManagerParams): Promise<boolean | undefined> {
    return await this.getWallet().checkManagerIsExist(props);
  }

  // async getRememberMeBlackList(): Promise<string[] | undefined> {
  //   const [currentNetwork, state] = await Promise.all([this.networkType(), this.getState()]);
  //   return state.cms.rememberMeBlackListMap?.[currentNetwork]?.map(({ url }) => url);
  // }
}
