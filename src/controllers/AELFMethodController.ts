import { MethodsBase, ResponseCode, MethodsWallet, ChainId, NetworkType } from '@portkey/provider-types';
import { RequestCommonHandler, SendResponseFun } from '../service/types';
import { IRequestPayload, WalletPageType } from '../types';
import errorHandler from '../utils/errorHandler';
import { WebWalletDappManager } from '../utils/dappManager/WebWalletDappManager';
import ApprovalController from './ApprovalController';
import SWEventController from './EventController/SWEventController';
// import { checkIsCipherText, getApproveSymbol } from '../utils';
import { checkIsCipherText } from '../utils';
import { getContract, getManager, getManagerSignature, getSignature, getTransactionSignature } from '../utils/wallet';
// import { randomId } from '@portkey/utils';
import { ChainInfo } from '@portkey/services';
import { customFetch } from '../utils/fetch';
import { getNetworkConfig } from '../utils/config';
import { CheckSecurityResult } from '../types/security';
import { ApproveMethod, CA_METHOD_WHITELIST } from '../constants/dapp';
import OpenPageService from '../service/OpenPageService';
// import { getGuardiansApprovedByApprove } from '../utils/guardian';
import { ZERO } from '../constants/misc';

const aelfMethodList = [
  MethodsBase.CA_HASH,
  MethodsBase.ACCOUNTS,
  MethodsBase.CHAIN_ID,
  MethodsBase.CHAIN_IDS,
  MethodsBase.CHAINS_INFO,
  MethodsBase.WALLET_INFO,
  MethodsBase.REQUEST_ACCOUNTS,
  MethodsBase.SEND_TRANSACTION,
  MethodsBase.SET_WALLET_CONFIG_OPTIONS,
  MethodsWallet.GET_WALLET_MANAGER_SIGNATURE,
  MethodsWallet.GET_WALLET_SIGNATURE,
  MethodsBase.NETWORK,
  MethodsWallet.GET_WALLET_STATE,
  MethodsWallet.GET_WALLET_NAME,
  MethodsWallet.GET_WALLET_AVATAR,
  MethodsWallet.GET_WALLET_CURRENT_MANAGER_ADDRESS,
  MethodsWallet.GET_WALLET_MANAGER_SYNC_STATUS,
  MethodsWallet.GET_WALLET_TRANSACTION_SIGNATURE,
  MethodsWallet.WALLET_LOCK,
];
interface AELFMethodControllerProps {
  approvalController: ApprovalController;
  appId: string;
  getPassword: () => string | null;
  networkType: NetworkType;
}
export default class AELFMethodController {
  protected getPassword: () => string | null;
  protected dappManager: WebWalletDappManager;
  protected networkType: NetworkType;
  protected managerReadOnly: boolean;
  protected approvalController: ApprovalController;
  public aelfMethodList: string[];
  public config: { [key: string]: { [key: string]: boolean } };

  constructor({ approvalController, getPassword, appId, networkType }: AELFMethodControllerProps) {
    this.approvalController = approvalController;
    this.getPassword = getPassword;
    this.aelfMethodList = aelfMethodList;
    this.dappManager = new WebWalletDappManager({ appId });
    this.config = {};
    this.networkType = networkType;
    this.managerReadOnly = true;
  }

  checkIsReadOnly = async (chainId: ChainId) => {
    const caHash = this.dappManager.caHash();
    const chainInfo = await this.dappManager.getChainInfo(chainId);
    const managerAddress = await this.dappManager.currentManagerAddress();

    if (!chainInfo) return;
    const contract = await this.getCaContract(chainInfo);
    if (!contract) return;

    const rs = await contract.callViewMethod('IsManagerReadOnly', {
      caHash,
      manager: managerAddress,
    });
    console.log('checkIsReadOnly', rs, caHash, managerAddress);

    return !!rs?.data;
  };

  protected handleApprove = async (sendResponse: SendResponseFun, message: any) => {
    const { payload, eventName } = message || {};

    const { params } = payload || {};
    const chainId = message.payload?.chainId;
    const caHash = this.dappManager.caHash();
    const chainInfo = await this.dappManager.getChainInfo(chainId);
    const originChainId = await this.dappManager.getOriginChainId();

    if (!chainInfo) return;

    const { symbol, amount, spender } = params?.paramsOption || {};
    // check approve input && check valid amount
    if (!(symbol && amount && spender) || ZERO.plus(amount).isNaN() || ZERO.plus(amount).lte(0)) {
      return sendResponse({
        ...errorHandler(410002),
        data: {
          code: ResponseCode.ERROR_IN_PARAMS,
          message,
        },
      });
    }

    const tokenContract = await this.getTokenContract(chainInfo);
    if (typeof tokenContract === 'string') {
      return sendResponse({
        ...errorHandler(410002),
        data: {
          code: ResponseCode.ERROR_IN_PARAMS,
          message: tokenContract,
        },
      });
    }

    const tokenInfo = await tokenContract?.callViewMethod('GetTokenInfo', { symbol });

    if (tokenInfo?.error || isNaN(tokenInfo?.data.decimals)) {
      return sendResponse({
        ...errorHandler(410002),
        data: {
          code: ResponseCode.ERROR_IN_PARAMS,
          message: `${symbol} error`,
        },
      });
    }

    const allowanceReq = await OpenPageService.openPage({
      pageType: WalletPageType.SetAllowance,
      data: {
        caHash,
        networkType: this.networkType,
        originChainId,
        targetChainId: payload.chainId,
        symbol,
        amount,
        approveInfo: {
          ...params?.paramsOption,
          decimals: tokenInfo?.data.decimals,
          targetChainId: payload.chainId,
          contractAddress: chainInfo?.caContractAddress,
        },
        batchApproveNFT: this.config?.batchApproveNFT,
      },
    });

    if (allowanceReq?.error !== 0 && allowanceReq?.message) {
      return sendResponse({
        ...allowanceReq,
        data: {
          code: allowanceReq.error,
        },
      });
    }

    if (!allowanceReq?.data) {
      return sendResponse({
        ...errorHandler(410002),
        data: {
          code: ResponseCode.ERROR_IN_PARAMS,
        },
      });
    }

    const { guardiansApproved, amount: approvedAmount, symbol: approvedSymbol } = allowanceReq.data;
    // const finallyApproveSymbol = this.config?.batchApproveNFT ? getApproveSymbol(symbol) : symbol;

    // console.log('guardiansApproved: ', guardiansApproved);
    // const guardiansApproved = data?.guardiansApproved || [];
    return this.handleTransaction(sendResponse, {
      payload: {
        ...payload,
        method: ApproveMethod.ca,
        contractAddress: chainInfo?.caContractAddress,
        params: {
          paramsOption: {
            caHash,
            spender: spender,
            // symbol: finallyApproveSymbol,
            symbol: approvedSymbol,
            // amount: amount,
            amount: approvedAmount,
            // guardiansApproved: getGuardiansApprovedByApprove(guardiansApproved),
            guardiansApproved: guardiansApproved,
          },
        },
      },
    } as any);
  };

  handleRequest = async ({ params, method, callBack }: { params: any; method: any; callBack: any }) => {
    return await callBack(params);
  };

  dispenseMessage = (message: IRequestPayload, sendResponse: SendResponseFun) => {
    switch (message.method) {
      case MethodsBase.SET_WALLET_CONFIG_OPTIONS:
        this.setWalletConfigOptions(sendResponse, message.payload);
        break;
      case MethodsBase.CHAIN_ID:
        this.getChainId(sendResponse, message.payload);
        break;
      case MethodsBase.CHAIN_IDS:
        this.getChainIds(sendResponse, message.payload);
        break;
      case MethodsBase.ACCOUNTS:
        this.getAccounts(sendResponse, message.payload);
        break;
      case MethodsBase.CHAINS_INFO:
        this.getChainsInfo(sendResponse, message.payload);
        break;
      case MethodsBase.SEND_TRANSACTION:
        this.sendTransaction(sendResponse, message.payload);
        break;
      case MethodsBase.REQUEST_ACCOUNTS:
        this.requestAccounts(sendResponse, message.payload);
        break;

      case MethodsBase.NETWORK:
        this.getNetwork(sendResponse, message.payload);
        break;
      case MethodsBase.CA_HASH:
        this.getCAHash(sendResponse, message.payload);
        break;
      case MethodsBase.WALLET_INFO:
        this.getWalletInfo(sendResponse, message.payload);
        break;

      case MethodsWallet.GET_WALLET_SIGNATURE: {
        const isCipherText = checkIsCipherText(message.payload.payload.data);
        message.payload.payload.isCipherText = isCipherText;
        this.getSignature(sendResponse, message.payload);
        break;
      }
      case MethodsWallet.GET_WALLET_TRANSACTION_SIGNATURE: {
        if (message.payload.payload) message.payload.payload.autoSha256 = true;
        const { hexData, data } = message.payload.payload;
        if (!data && hexData) message.payload.payload.data = hexData;
        message.payload.payload.isCipherText = true;
        this.getTransactionSignature(sendResponse, message.payload);
        break;
      }
      case MethodsWallet.GET_WALLET_MANAGER_SIGNATURE: {
        if (message.payload.payload) message.payload.payload.autoSha256 = true;
        const { hexData, data } = message.payload.payload;
        if (!data && hexData) message.payload.payload.data = hexData;
        // message.payload.payload.isCipherText = true;
        message.payload.payload.isManagerSignature = true;
        this.getManagerSignature(sendResponse, message.payload);
        break;
      }
      case MethodsWallet.GET_WALLET_STATE:
        this.getWalletState(sendResponse, message.payload);
        break;
      case MethodsWallet.GET_WALLET_NAME:
        this.getWalletName(sendResponse, message.payload);
        break;

      case MethodsWallet.GET_WALLET_AVATAR:
        this.getWalletAvatar(sendResponse, message.payload);
        break;
      case MethodsWallet.GET_WALLET_CURRENT_MANAGER_ADDRESS:
        this.getCurrentManagerAddress(sendResponse, message.payload);
        break;
      case MethodsWallet.GET_WALLET_MANAGER_SYNC_STATUS:
        this.getWalletManagerSyncStatus(sendResponse, message.payload);
        break;
      case MethodsWallet.WALLET_LOCK:
        this.lockWallet(sendResponse, message.payload);
        break;
      default:
        sendResponse(
          errorHandler(
            700001,
            'Not Support',
            // `The current network is ${pageState.chain.currentChain.chainType}, which cannot match this method  (${message.type})`,
          ),
        );
        break;
    }
  };

  setWalletConfigOptions = async (sendResponse: SendResponseFun, message: any) => {
    this.config = Object.assign(this.config, { [message.origin]: message.payload });

    sendResponse({ ...errorHandler(0), data: true });
  };

  getCurrentManagerAddress: RequestCommonHandler = async (sendResponse, message) => {
    try {
      const managerAddress = await this.dappManager.currentManagerAddress();
      if (!managerAddress)
        return sendResponse({
          ...errorHandler(410001),
          data: {
            code: ResponseCode.INTERNAL_ERROR,
            msg: 'Please check if the user is logged in to the wallet',
          },
        });

      sendResponse({ ...errorHandler(0), data: managerAddress });
    } catch (error) {
      sendResponse({
        ...errorHandler(500001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  checkManagerSyncStatus = async (chainId: ChainId) => {
    const managerAddress = await this.dappManager.currentManagerAddress();
    const caHash = await this.dappManager.caHash();
    return this.dappManager.checkManagerIsExist({ chainId, caHash, managementAddress: managerAddress || '' });
  };

  getWalletManagerSyncStatus: RequestCommonHandler = async (sendResponse: SendResponseFun, message) => {
    try {
      const chainId = message.payload?.chainId;

      if (!(await this.dappManager.getChainInfo(chainId)))
        throw sendResponse({
          ...errorHandler(400001),
          data: {
            code: ResponseCode.ERROR_IN_PARAMS,
            msg: 'Invalid chain id',
          },
        });

      if (!chainId)
        return sendResponse({
          ...errorHandler(400001),
          data: {
            code: ResponseCode.ERROR_IN_PARAMS,
          },
        });
      return sendResponse({
        ...errorHandler(0),
        data: Boolean(await this.checkManagerSyncStatus(chainId)),
      });
    } catch (error) {
      return sendResponse({
        ...errorHandler(500001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  getWalletName: RequestCommonHandler = async (sendResponse: SendResponseFun, message) => {
    try {
      // TODO: change
      const isLocked = await this.dappManager.isLocked();
      if (isLocked)
        return sendResponse({
          ...errorHandler(400001),
          data: {
            code: ResponseCode.UNAUTHENTICATED,
          },
        });

      sendResponse({ ...errorHandler(0), data: await this.dappManager.walletName() });
    } catch (error) {
      sendResponse({
        ...errorHandler(500001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  getWalletAvatar: RequestCommonHandler = async (sendResponse: SendResponseFun, message) => {
    try {
      // TODO: change
      const isLocked = await this.dappManager.isLocked();
      if (isLocked)
        return sendResponse({
          ...errorHandler(400001),
          data: {
            code: ResponseCode.UNAUTHENTICATED,
          },
        });

      sendResponse({ ...errorHandler(0), data: await this.dappManager.walletAvatar() });
    } catch (error) {
      sendResponse({
        ...errorHandler(500001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  getWalletState: RequestCommonHandler = async (sendResponse: SendResponseFun, message) => {
    try {
      let data: any = {
        isConnected: !this.dappManager.isLocked(),
        isLogged: this.dappManager.isLogged(),
      };
      if (data.isConnected) {
        data = {
          ...data,
          accounts: await this.dappManager.accounts(),
          chainIds: await this.dappManager.chainId(),
        };
      }
      sendResponse({ ...errorHandler(0), data });
    } catch (error) {
      sendResponse(errorHandler(200002, error));
    }
  };

  getChainsInfo: RequestCommonHandler = async sendResponse => {
    try {
      const data = await this.dappManager.chainsInfo();
      sendResponse({ ...errorHandler(0), data });
    } catch (error) {
      console.log('getChainsInfo===', error);
      sendResponse({
        ...errorHandler(100001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  getAccounts: RequestCommonHandler = async (sendResponse, message) => {
    try {
      sendResponse({ ...errorHandler(0), data: await this.dappManager.accounts() });
    } catch (error) {
      console.log('getAccounts===', error);
      sendResponse({
        ...errorHandler(100001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  getChainId: RequestCommonHandler = async sendResponse => {
    try {
      const result = await this.dappManager.getHolderInfoByManager();
      console.log('getHolderInfoByManager', result);

      const chainId = await this.dappManager.chainId();
      sendResponse({ ...errorHandler(0), data: chainId });
    } catch (error) {
      console.log('getChainId===', error);
      sendResponse({
        ...errorHandler(100001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  getChainIds: RequestCommonHandler = async sendResponse => {
    try {
      const chainIds = await this.dappManager.chainIds();
      sendResponse({ ...errorHandler(0), data: chainIds });
    } catch (error) {
      console.log('getChainIds===', error);
      sendResponse({
        ...errorHandler(100001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  getWalletInfo: RequestCommonHandler = async sendResponse => {
    sendResponse({ ...errorHandler(0), data: await this.dappManager.walletInfo() });
  };

  requestAccounts: RequestCommonHandler = async (sendResponse, message) => {
    try {
      console.log('requestAccounts');

      SWEventController.dispatchEvent({
        eventName: 'connected',
        data: { chainIds: await this.dappManager.chainIds(), origin: message.origin },
      });
      SWEventController.dispatchEvent({
        eventName: 'chainChanged',
        data: await this.dappManager.chainIds(),
      });

      sendResponse({ ...errorHandler(0), data: await this.dappManager.accounts() });
    } catch (error) {
      console.log('requestAccounts===', error);
      sendResponse({
        ...errorHandler(100001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  checkWalletSecurity = async (checkTransferSafeChainId: ChainId) => {
    try {
      const caHash = await this.dappManager.caHash();

      const currentNetwork = getNetworkConfig(this.networkType);
      const result = await customFetch(`${currentNetwork.serviceUrl}/api/app/user/security/balanceCheck`, {
        method: 'GET',
        params: {
          caHash,
          checkTransferSafeChainId,
        },
      });
      return result;
    } catch (error) {
      console.log('checkWalletSecurity error', error);
      throw 'checkWalletSecurity error';
    }
  };

  handleTransaction: RequestCommonHandler = async (sendResponse, message) => {
    try {
      if (!message?.payload?.params)
        return sendResponse({ ...errorHandler(400001), data: { code: ResponseCode.ERROR_IN_PARAMS } });

      const { payload } = message;
      console.log(message, 'message====sendTransaction');
      const chainInfo = await this.dappManager.getChainInfo(payload.chainId);
      const caHash = await this.dappManager.caHash();

      if (!chainInfo) {
        return;
      }
      const isForward = chainInfo.caContractAddress !== payload.contractAddress;
      const method = isForward ? 'ManagerForwardCall' : payload?.method;
      // if (!CA_METHOD_WHITELIST.includes(payload.method))
      if (!CA_METHOD_WHITELIST.includes(method))
        return sendResponse({
          ...errorHandler(400001),
          data: {
            code: ResponseCode.CONTRACT_ERROR,
            msg: 'The current method is not supported',
          },
        });

      // transfer start
      const contract: any = await this.getCaContract(chainInfo);
      if (!contract) return;
      // const isForward = chainInfo.caContractAddress !== payload.contractAddress;

      let paramsOption = (payload.params as { paramsOption: object }).paramsOption,
        functionName = payload.method;

      if (isForward) {
        paramsOption = {
          caHash,
          methodName: payload.method,
          contractAddress: payload.contractAddress,
          args: paramsOption,
        };
        functionName = 'ManagerForwardCall';
      }

      const data = await contract!.callSendMethod(functionName, '', paramsOption, { onMethod: 'transactionHash' });
      //  transfer finish
      sendResponse({ ...errorHandler(0), data });
    } catch (error) {
      console.log('sendTransaction===', error);
      sendResponse({
        ...errorHandler(100001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  sendTransaction: RequestCommonHandler = async (sendResponse, message) => {
    try {
      if (!message?.payload?.params)
        return sendResponse({ ...errorHandler(400001), data: { code: ResponseCode.ERROR_IN_PARAMS } });

      const { payload } = message;
      const chainInfo = await this.dappManager.getChainInfo(payload.chainId);
      const caHash = await this.dappManager.caHash();
      const originChainId = await this.dappManager.getOriginChainId();
      console.log(message, chainInfo, 'message,chainInfo====sendTransaction');

      if (!chainInfo || !chainInfo.endPoint || !caHash)
        return sendResponse({
          ...errorHandler(200005),
          data: {
            code: ResponseCode.ERROR_IN_PARAMS,
            msg: 'invalid chain id',
          },
        });

      if (!payload?.contractAddress)
        return sendResponse({
          ...errorHandler(200005),
          data: {
            code: ResponseCode.ERROR_IN_PARAMS,
            msg: 'Invalid contractAddress',
          },
        });

      // readOnly check
      if (this.managerReadOnly) {
        const managerReadOnly = await this.checkIsReadOnly(payload.chainId);
        this.managerReadOnly = !!managerReadOnly;
        if (this.managerReadOnly) {
          const result = await OpenPageService.openPage({
            pageType: WalletPageType.GuardianApproveForLogin,
            data: {
              caHash,
              networkType: this.networkType,
              originChainId,
              targetChainId: payload.chainId,
            },
          });

          // TODO: continue
          if (result) {
            this.managerReadOnly = false;
          }
        }
      }
      // readOnly check finish

      const safeRes: CheckSecurityResult = await this.checkWalletSecurity(payload.chainId);
      console.log('CheckSecurityResult result', safeRes);

      const isOriginChainId = originChainId === payload.chainId;

      const isSafe = safeRes.isTransferSafe || (isOriginChainId && safeRes.isOriginChainSafe);

      if (!isSafe) {
        return sendResponse({
          ...errorHandler(410001),
          data: {
            code: ResponseCode.USER_DENIED,
            msg: 'The account is not safe, please add guardian',
          },
        });
      }

      // const showGuardian =
      //   (isOriginChainId && !safeRes.isOriginChainSafe) ||
      //   (!isOriginChainId && !safeRes.isSynchronizing) ||
      //   (!isOriginChainId && safeRes.isSynchronizing && !safeRes.isOriginChainSafe);
      // const showSync = !isOriginChainId && safeRes.isSynchronizing && safeRes.isOriginChainSafe;

      // if (!isSafe && (showGuardian || showSync)) {
      //   // Open Prompt to approve add guardian

      //   let _txId;
      //   if (Array.isArray(safeRes.accelerateGuardians)) {
      //     const _accelerateGuardian = safeRes.accelerateGuardians.find(
      //       item => item.transactionId && item.chainId === originChainId,
      //     );
      //     _txId = _accelerateGuardian?.transactionId;
      //   }

      //   await OpenPageService.openPage({
      //     pageType: WalletPageType.AddGuardian,
      //     data: {
      //       showGuardian,
      //       accelerateChainId: payload.chainId,
      //       accelerateGuardianTxId: _txId,
      //     },
      //   });
      // }

      // is approve
      const isApprove = await this.dappManager.isApprove({
        contractAddress: payload.contractAddress,
        method: payload?.method,
        chainId: payload.chainId,
      });

      // const key = randomId();
      if (isApprove) {
        if (payload?.params?.paramsOption.symbol == '*') {
          return sendResponse({ ...errorHandler(400001), data: { code: ResponseCode.ERROR_IN_PARAMS } });
        }
        // const _config = this.config?.[origin];
        return this.handleApprove(sendResponse, message);
      }

      this.handleTransaction(sendResponse, message);
    } catch (error) {
      console.log('sendTransaction===', error);
      sendResponse({
        ...errorHandler(100001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  getSignature: RequestCommonHandler = async (sendResponse, message) => {
    const autoSha256 = message?.payload.autoSha256;
    const isManagerSignature = message?.payload.isManagerSignature;

    if (isManagerSignature) delete message.payload.isManagerSignature;
    if (autoSha256) delete message.payload.autoSha256;
    try {
      if (
        !message?.payload?.data ||
        (typeof message.payload.data !== 'string' && typeof message.payload.data !== 'number') // The problem left over from the browser history needs to pass the number type
      ) {
        return sendResponse({ ...errorHandler(400001), data: { code: ResponseCode.ERROR_IN_PARAMS } });
      }

      // if (!(await this.dappManager.isActive(message.origin)))
      //   return sendResponse({
      //     ...errorHandler(200004),
      //     data: {
      //       code: ResponseCode.UNAUTHENTICATED,
      //     },
      //   });

      // const result = await this.handleRequest({
      //   params: {
      //     origin: message.origin,
      //     payload: {
      //       data: message.payload.data,
      //       origin: message.origin,
      //       isCipherText: message.payload.isCipherText,
      //     },
      //   },
      //   method: MethodsWallet.GET_WALLET_SIGNATURE,
      //   callBack: (params: any) =>
      //     this.approvalController.authorizedToGetSignature(params, autoSha256, isManagerSignature),
      // });

      const manager = await getManager();
      const data = getSignature(manager, message.payload.data);
      console.log('==== signature', message, data);

      // if (result.error === 200003)
      //   return sendResponse({
      //     ...errorHandler(200003),
      //     data: {
      //       code: ResponseCode.USER_DENIED,
      //     },
      //   });
      // if (result.error)
      //   return sendResponse({
      //     ...errorHandler(700002),
      //     data: {
      //       code: ResponseCode.CONTRACT_ERROR,
      //     },
      //   });
      sendResponse({ ...errorHandler(0), data });
    } catch (error) {
      console.log('getSignature===', error);
      sendResponse({
        ...errorHandler(100001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  getTransactionSignature: RequestCommonHandler = async (sendResponse, message) => {
    const autoSha256 = message?.payload.autoSha256;
    const isManagerSignature = message?.payload.isManagerSignature;

    if (isManagerSignature) delete message.payload.isManagerSignature;
    if (autoSha256) delete message.payload.autoSha256;
    try {
      if (
        !message?.payload?.data ||
        (typeof message.payload.data !== 'string' && typeof message.payload.data !== 'number') // The problem left over from the browser history needs to pass the number type
      ) {
        return sendResponse({ ...errorHandler(400001), data: { code: ResponseCode.ERROR_IN_PARAMS } });
      }

      const pin = this.getPassword() || '';
      const manager = await getManager();

      const data = getTransactionSignature(manager, message.payload.data);
      console.log('==== transaction signature', message, data);

      sendResponse({ ...errorHandler(0), data });
    } catch (error) {
      console.log('getSignature===', error);
      sendResponse({
        ...errorHandler(100001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  getManagerSignature: RequestCommonHandler = async (sendResponse, message) => {
    const autoSha256 = message?.payload.autoSha256;
    const isManagerSignature = message?.payload.isManagerSignature;

    if (isManagerSignature) delete message.payload.isManagerSignature;
    if (autoSha256) delete message.payload.autoSha256;
    try {
      if (
        !message?.payload?.data ||
        (typeof message.payload.data !== 'string' && typeof message.payload.data !== 'number') // The problem left over from the browser history needs to pass the number type
      ) {
        return sendResponse({ ...errorHandler(400001), data: { code: ResponseCode.ERROR_IN_PARAMS } });
      }

      const pin = this.getPassword() || '';
      const manager = await getManager();

      const data = getManagerSignature(manager, message.payload.data);
      console.log('==== manager signature', message, data);

      sendResponse({ ...errorHandler(0), data });
    } catch (error) {
      console.log('getSignature===', error);
      sendResponse({
        ...errorHandler(100001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  getNetwork: RequestCommonHandler = async sendResponse => {
    try {
      const networkType = this.networkType;
      sendResponse({ ...errorHandler(0), data: networkType });
    } catch (error) {
      console.log('getNetwork===', error);
      sendResponse({
        ...errorHandler(100001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };
  getCAHash: RequestCommonHandler = async sendResponse => {
    try {
      const caHash = await this.dappManager.caHash();
      sendResponse({ ...errorHandler(0), data: caHash });
    } catch (error) {
      console.log('getCAHash===', error);
      sendResponse({
        ...errorHandler(100001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  lockWallet: RequestCommonHandler = async sendResponse => {
    try {
      const result = await this.dappManager.lockWallet();
      sendResponse({ ...errorHandler(0), data: result });
    } catch (error) {
      console.log('getCAHash===', error);
      sendResponse({
        ...errorHandler(100001),
        data: {
          code: ResponseCode.INTERNAL_ERROR,
        },
      });
    }
  };

  async getCaContract(chainInfo: ChainInfo) {
    const manager = await this.getManager();
    return await getContract({
      manager,
      rpcUrl: chainInfo?.endPoint || '',
      contractAddress: chainInfo?.caContractAddress || '',
    });
  }

  async getTokenContract(chainInfo: ChainInfo) {
    const manager = await this.getManager();
    return await getContract({
      manager,
      rpcUrl: chainInfo?.endPoint || '',
      contractAddress: chainInfo?.defaultToken?.address || '',
    });
  }

  async getManager() {
    const manager = await getManager();
    return manager;
  }
}
