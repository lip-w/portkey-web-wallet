import OpenPageService from "@/service/OpenPageService";
import { WalletPageType } from "@/types";

export default function DevEntry() {
  return (
    <>
      <button
        onClick={() => {
          OpenPageService.openPage({ pageType: WalletPageType.Login });
        }}>
        Login
      </button>
      <button
        onClick={() => {
          OpenPageService.openPage({ pageType: WalletPageType.Assets });
        }}>
        Assets
      </button>
      <button
        onClick={() => {
          OpenPageService.openPage({ pageType: WalletPageType.UnLock });
        }}>
        UnLock
      </button>
    </>
  );
}
