import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  Wallet,
  ChevronRight,
  Copy,
  CheckCircle,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useGitHubAuth } from "./GitHubAuth";

interface ConnectWalletButtonProps {
  variant?: "nav" | "hero" | "inline";
  className?: string;
}

interface WalletRegistrationProps {
  address: string;
}

function WalletRegistration({ address }: WalletRegistrationProps) {
  const { user: githubUser } = useGitHubAuth();

  const registeredAddress = useRef<string | null>(null);

  const backendUrl =
    import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

  useEffect(() => {
    if (!githubUser || !address) {
      return;
    }

    if (registeredAddress.current === address) {
      return;
    }

    const registerWallet = async () => {
      try {
        console.log(
          "🔗 Registering wallet:",
          githubUser.login,
          "→",
          address
        );

        const response = await fetch(
          `${backendUrl}/api/register-wallet`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              githubLogin: githubUser.login,
              walletAddress: address,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          console.error(
            "❌ Wallet registration failed:",
            data
          );
          return;
        }

        console.log(
          "✅ Wallet registered successfully:",
          data
        );

        registeredAddress.current = address;
      } catch (error) {
        console.error(
          "❌ Wallet registration error:",
          error
        );
      }
    };

    registerWallet();
  }, [address, githubUser, backendUrl]);

  return null;
}

export function ConnectWalletButton({
  variant = "nav",
  className = "",
}: ConnectWalletButtonProps) {
  const [copied, setCopied] = useState(false);

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const connected = mounted && account && chain;

        if (!mounted) {
          return (
            <div
              style={{
                opacity: 0,
                pointerEvents: "none",
              }}
            />
          );
        }

        if (!connected) {
          if (variant === "hero") {
            return (
              <button
                onClick={openConnectModal}
                className={`group relative px-8 py-4 bg-gradient-to-r from-[#00f0ff] to-[#8b5cf6] rounded-lg overflow-hidden hover:shadow-lg hover:shadow-[#00f0ff]/50 transition-all ${className}`}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-[#00f0ff] to-[#8b5cf6] opacity-0 group-hover:opacity-100 blur-xl transition-opacity" />

                <span className="relative flex items-center gap-2 text-white font-semibold">
                  <Wallet className="w-5 h-5" />
                  Connect Wallet
                </span>
              </button>
            );
          }

          return (
            <button
              onClick={openConnectModal}
              className={`glass px-6 py-2 rounded-lg hover:bg-white/10 transition-all flex items-center gap-2 group ${className}`}
            >
              <Wallet className="w-4 h-4" />

              <span>Connect Wallet</span>

              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              onClick={openChainModal}
              className={`px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 transition-all text-sm font-medium ${className}`}
            >
              ⚠ Wrong Network
            </button>
          );
        }

        return (
          <>
            <WalletRegistration address={account.address} />

            <div className={`flex items-center gap-2 ${className}`}>
              <button
                onClick={openChainModal}
                className="hidden sm:flex items-center gap-1.5 glass px-3 py-2 rounded-lg hover:bg-white/10 transition-all text-xs"
              >
                {chain.hasIcon && chain.iconUrl && (
                  <img
                    src={chain.iconUrl}
                    alt={chain.name}
                    className="w-4 h-4 rounded-full"
                  />
                )}

                <span className="text-gray-300">
                  {chain.name}
                </span>
              </button>

              <button
                onClick={openAccountModal}
                className="glass flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-white/10 transition-all group"
              >
                <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />

                <span className="text-sm font-medium">
                  {account.displayName}
                </span>

                {account.displayBalance && (
                  <span className="hidden sm:inline text-xs text-gray-400 border-l border-white/10 pl-2">
                    {account.displayBalance}
                  </span>
                )}
              </button>

              <button
                onClick={() => copyAddress(account.address)}
                className="glass p-2 rounded-lg hover:bg-white/10 transition-all"
                title="Copy address"
              >
                {copied ? (
                  <CheckCircle className="w-4 h-4 text-[#10b981]" />
                ) : (
                  <Copy className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>
          </>
        );
      }}
    </ConnectButton.Custom>
  );
}