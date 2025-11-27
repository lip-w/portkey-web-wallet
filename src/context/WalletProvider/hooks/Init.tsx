import { ContentPostStream } from '@portkey/iframe-provider';
import { useCallback, useEffect, useRef } from 'react';
import { useWalletDispatch } from './index';
import { basicWebWalletView, IWalletOptions } from '../actions';
import { IPageState } from '../../types';
import { generateErrorResponse, generateNormalResponse } from '@portkey/provider-utils';
import { browser } from '@portkey/utils';
import { isMethodsBase, isMethodsUnimplemented } from '@portkey/providers';
import {
  MethodsType,
  ProviderError,
  ResponseMessagePreset,
  ResponseCode,
  NotificationEvents,
} from '@portkey/provider-types';
import qs from 'qs';
import { IRequestPayload } from '@/types';
import OpenPageService from '@/service/OpenPageService';
import ServiceWorkerInstantiate from '@/service/ServiceWorkerInstantiate';
import { SendResponseFun } from '@/service/types';
import { WEB_WALLET_DISPATCH_EVENT } from '@/constants/events';
import { eventBus } from '@/utils/lib';
let pageStream: ContentPostStream;
const INPAGE_TARGET = 'PORTKEY_WEB_WALLET_INGAGE';
const CONTENT_TARGET = 'PORTKEY_WEB_WALLET_CONTENT';

const methodCheck = (method: string): method is MethodsType => {
  return isMethodsBase(method) || isMethodsUnimplemented(method);
};

export function ServiceWorker() {
  const dispatch = useWalletDispatch();
  const serviceRef = useRef<ServiceWorkerInstantiate>();

  useEffect(() => {
    const options = qs.parse(window.location.search.replace('?', '')) as unknown as IWalletOptions;

    if (Object.values(options).length > 0) {
      dispatch(
        basicWebWalletView.setWalletOptions.actions({
          ...options,
          isTelegram: typeof options.isTelegram === 'boolean' ? options.isTelegram : options.isTelegram === 'true',
        }),
      );
    }

    serviceRef.current = new ServiceWorkerInstantiate({ appId: options.appId, networkType: options.networkType });
  }, [dispatch]);

  useEffect(() => {
    const eventHandler = (message: any) => {
      pageStream.send({ ...message, target: INPAGE_TARGET });
    };
    eventBus.addListener(WEB_WALLET_DISPATCH_EVENT, eventHandler);

    return () => {
      eventBus.removeListener(WEB_WALLET_DISPATCH_EVENT, eventHandler);
    };
  }, []);

  const setupInternalMessaging = useCallback((request: IRequestPayload) => {
    const sendResponse: SendResponseFun = result => {
      delete request.payload;
      let response;
      if (!result) return;
      if (result.error === 0) {
        response = generateNormalResponse({
          ...request,
          data: result.data,
          target: INPAGE_TARGET,
        });
      } else {
        response = generateErrorResponse({ ...request, ...result.data, msg: result.message, target: INPAGE_TARGET });
      }
      console.log(result, response, 'result===internalCommunicate');
      pageStream.send(response);
    };
    serviceRef.current?.setupInternalMessaging(sendResponse, request);
  }, []);

  useEffect(() => {
    if (import.meta.env.VITE_SHOW_ENTRY) return;
    pageStream = new ContentPostStream({ name: CONTENT_TARGET });

    pageStream.on('data', (data: Buffer) => {
      try {
        const params = JSON.parse(data.toString());
        console.log('IframePage----onData=1', params);
        const url = new URL(params.origin);
        const icon = browser.getFaviconUrl(url.href, 50);
        const message = Object.assign({}, params, {
          hostname: url.hostname,
          origin: url.origin,
          href: url.href,
          icon,
          payload: params,
        });
        const method = message.method;

        if (!methodCheck(method)) {
          return pageStream.send(
            new ProviderError(ResponseMessagePreset['UNKNOWN_METHOD'], ResponseCode.UNKNOWN_METHOD) as any,
          );
        }
        console.log(message, 'message====');
        setupInternalMessaging(message);
      } catch (error) {
        console.error('ContentPostStream', error);
      }
    });
  }, [setupInternalMessaging]);

  useEffect(() => {
    // init service
    //
    // init change page event
    const pageVisibleChange = (visible: boolean) => {
      console.log(visible, 'visible===pageVisibleChange');
      pageStream.send({
        eventName: NotificationEvents.WALLET_VISIBLE,
        info: {
          code: 0,
          data: visible,
        },
      });
    };
    const openPageHandler = (pageState: IPageState) => {
      dispatch(basicWebWalletView.setWalletPageState.actions(pageState));
      pageVisibleChange(true);
    };

    const closePageHandler = () => {
      dispatch(basicWebWalletView.setWalletPageState.actions(null));

      pageVisibleChange(false);
    };
    OpenPageService.onOpenPage(openPageHandler);
    OpenPageService.onClosePage(closePageHandler);

    return () => {
      OpenPageService.removeOpenPageListener(openPageHandler);
      OpenPageService.removeClosePageListener(closePageHandler);
    };
  }, [dispatch]);

  return null;
}
