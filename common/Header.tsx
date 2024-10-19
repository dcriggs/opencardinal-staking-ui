import { AccountConnect } from '@cardinal/namespaces-components'
import { getLuminance } from '@mui/material'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { GlyphWallet } from 'assets/GlyphWallet'
import { useStakePoolId } from 'hooks/useStakePoolId'
import { useEnvironmentCtx } from 'providers/EnvironmentProvider'
import { useStakePoolMetadataCtx } from 'providers/StakePoolMetadataProvider'

import { Airdrop } from './Airdrop'
import { Announcement } from './Announcement'
import { ButtonSmall } from './ButtonSmall'
import { tryColor } from './colors'
import { asWallet } from './Wallets'

export const Header = () => {
  const { environment, secondaryConnection } = useEnvironmentCtx()
  const wallet = useWallet()
  const walletModal = useWalletModal()
  const { data: stakePoolId } = useStakePoolId()
  const { data: stakePoolMetadata } = useStakePoolMetadataCtx()

  return (
    <div>
      <Announcement />
      <div
        className={`mb-5 flex flex-wrap justify-center gap-6 px-10 pt-5 text-white md:justify-between`}
        style={{ color: stakePoolMetadata?.colors?.fontColor }}
      >
        <div className="flex items-center gap-3">
          <a
            target="_blank"
            href={
              stakePoolMetadata?.websiteUrl ||
              `/${
                environment.label !== 'mainnet-beta'
                  ? `?cluster=${environment.label}`
                  : ''
              }`
            }
            className="flex cursor-pointer text-xl font-semibold"
            rel="noreferrer"
          >
          </a>
          {environment.label !== 'mainnet-beta' && (
            <div className="cursor-pointer rounded-md bg-[#9945ff] p-1 text-[10px] italic text-white">
              {environment.label}
            </div>
          )}
          {environment.label !== 'mainnet-beta' ? (
            <div className="mt-0.5">
              <Airdrop />
            </div>
          ) : (
            ''
          )}
        </div>
        <div className="relative my-auto flex flex-wrap items-center justify-center gap-y-6 align-middle">
          <div className="mr-10 flex flex-wrap items-center justify-center gap-8">
            {stakePoolId &&
              stakePoolMetadata &&
              stakePoolMetadata.links?.map((link) => (
                <a
                  key={link.value}
                  href={link.value}
                  className="cursor-pointer transition-all hover:opacity-80"
                >
                  <p style={{ color: stakePoolMetadata?.colors?.fontColor }}>
                    {link.text}
                  </p>
                </a>
              ))}
          </div>
          {wallet.connected && wallet.publicKey ? (
            <AccountConnect
              dark={
                tryColor(stakePoolMetadata?.colors?.primary)
                  ? getLuminance(
                      tryColor(stakePoolMetadata?.colors?.primary)!
                    ) < 0.5
                  : true
              }
              connection={secondaryConnection}
              environment={environment.label}
              handleDisconnect={() => wallet.disconnect()}
              wallet={asWallet(wallet)}
            />
          ) : (
            <ButtonSmall
              className="transform rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 px-6 py-3 text-lg font-bold text-white shadow-lg transition-all duration-300 ease-in-out hover:scale-105 hover:bg-gradient-to-l hover:from-pink-500 hover:to-indigo-500"
              onClick={() => walletModal.setVisible(true)}
            >
              <>
                <GlyphWallet />
                <div className="text-white">Connect Wallet</div>
              </>
            </ButtonSmall>
          )}
        </div>
      </div>
    </div>
  )
}
