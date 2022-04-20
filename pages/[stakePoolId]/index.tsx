import { AccountData, findAta, tryGetAccount } from '@cardinal/common'
import * as splToken from '@solana/spl-token'
import {
  createStakeEntryAndStakeMint,
  stake,
  unstake,
  claimRewards,
  executeTransaction,
} from '@cardinal/staking'
import {
  ReceiptType,
  StakePoolData,
} from '@cardinal/staking/dist/cjs/programs/stakePool'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { TokenData } from 'api/types'
import { Header } from 'common/Header'
import Head from 'next/head'
import { useEnvironmentCtx } from 'providers/EnvironmentProvider'
import { useEffect, useState } from 'react'
import { Wallet } from '@metaplex/js'
import { useUserTokenData } from 'providers/TokenDataProvider'
import { useStakedTokenData } from 'providers/StakedTokenDataProvider'
import { LoadingSpinner } from 'common/LoadingSpinner'
import { useRouter } from 'next/router'
import { notify } from 'common/Notification'
import { handlePoolMapping } from 'common/utils'
import { getRewardDistributor } from '@cardinal/staking/dist/cjs/programs/rewardDistributor/accounts'
import { findRewardDistributorId } from '@cardinal/staking/dist/cjs/programs/rewardDistributor/pda'
import {
  getMintDecimalAmountFromNatural,
  getMintDecimalAmountFromNaturalV2,
  getMintNaturalAmountFromDecimal,
} from 'common/units'
import { BN } from '@project-serum/anchor'
import { RewardDistributorData } from '@cardinal/staking/dist/cjs/programs/rewardDistributor'
import { getPendingRewardsForPool } from '@cardinal/staking'
import { useTokenList } from 'providers/TokenListProvider'
import { getActiveStakeEntriesForPool } from '@cardinal/staking/dist/cjs/programs/stakePool/accounts'

function Home() {
  const router = useRouter()
  const { stakePoolId } = router.query
  const { connection } = useEnvironmentCtx()
  const [stakePool, setStakePool] = useState<AccountData<StakePoolData>>()
  const [rewardDistributor, setRewardDistributor] =
    useState<AccountData<RewardDistributorData>>()
  const wallet = useWallet()
  const {
    stakedRefreshing,
    setStakedAddress,
    stakedTokenDatas,
    stakedLoaded,
    refreshStakedTokenDatas,
  } = useStakedTokenData()
  const { refreshing, setAddress, tokenDatas, loaded, refreshTokenAccounts } =
    useUserTokenData()
  const [unstakedSelected, setUnstakedSelected] = useState<TokenData[]>([])
  const [stakedSelected, setStakedSelected] = useState<TokenData[]>([])
  const [claimableRewards, setClaimableRewards] = useState<number>(0)
  const [loadingRewards, setLoadingRewards] = useState<boolean>(false)
  const [loadingStake, setLoadingStake] = useState(false)
  const [loadingUnstake, setLoadingUnstake] = useState(false)
  const [loadingClaimRewards, setLoadingClaimRewards] = useState(false)
  const [mintName, setMintName] = useState('')
  const [loadingMintName, setLoadingMintName] = useState(true)
  const [mintInfo, setMintInfo] = useState<splToken.MintInfo>()
  const [totalStaked, setTotalStaked] = useState<number>()
  const { tokenList } = useTokenList()

  useEffect(() => {
    if (wallet && wallet.connected && wallet.publicKey) {
      setAddress(wallet.publicKey.toBase58())
      setStakedAddress(wallet.publicKey.toBase58())
    }
  }, [wallet.publicKey])

  useEffect(() => {
    if (stakePoolId) {
      const setData = async () => {
        try {
          const pool = await handlePoolMapping(
            connection,
            stakePoolId as string
          )
          setStakePool(pool)
          setTotalStaked(
            (await getActiveStakeEntriesForPool(connection, pool.pubkey)).length
          )
        } catch (e) {
          notify({
            message: `${e}`,
            type: 'error',
          })
        }
      }
      setData().catch(console.error)
    }
  }, [stakePoolId])

  useEffect(() => {
    if (stakePool) {
      const getRewards = async () => {
        setLoadingRewards(true)
        const [rewardDistributorId] = await findRewardDistributorId(
          stakePool!.pubkey
        )

        let rewardDistributorAcc: AccountData<RewardDistributorData> | null
        if (!rewardDistributor) {
          rewardDistributorAcc = await tryGetAccount(() =>
            getRewardDistributor(connection, rewardDistributorId)
          )
          if (!rewardDistributorAcc) {
            return
          }
          setRewardDistributor(rewardDistributorAcc)
        }
        if (!wallet) {
          throw new Error('Wallet not found')
        }

        if (rewardDistributor && mintName.length === 0) {
          setLoadingMintName(true)
          const tokenListData = tokenList.find(
            (tk) =>
              tk.address === rewardDistributor?.parsed.rewardMint.toString()
          )
          if (tokenListData) {
            setMintName(tokenListData.name)
          }
          setLoadingMintName(false)
        }

        let mint = new splToken.Token(
          connection,
          rewardDistributor!.parsed.rewardMint,
          splToken.TOKEN_PROGRAM_ID,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          null
        )
        setMintInfo(await mint.getMintInfo())

        let mintIds: PublicKey[] = []
        stakedTokenDatas.forEach((tk) => {
          if (!tk || !tk.stakeEntry) {
            return
          }
          mintIds.push(tk.stakeEntry?.parsed.originalMint!)
        })
        const rewards = await getPendingRewardsForPool(
          connection,
          wallet.publicKey!,
          mintIds,
          rewardDistributor!
        )
        let amount = new BN(
          Number(getMintDecimalAmountFromNatural(mintInfo!, new BN(rewards)))
        )
        setClaimableRewards(amount.toNumber())
        setLoadingRewards(false)
      }
      getRewards().catch(console.error)
    }
  }, [stakedTokenDatas])

  const filterTokens = () => {
    return tokenDatas.filter((token) => {
      return true
      let isAllowed = true
      const creatorAddresses = stakePool?.parsed.requiresCreators
      const collectionAddresses = stakePool?.parsed.requiresCollections
      if (token.tokenAccount?.account.data.parsed.info.state === 'frozen') {
        isAllowed = false
      }
      if (token?.metaplexData?.data?.data?.uri.includes('api.cardinal.so')) {
        isAllowed = false
      }
      if (creatorAddresses || collectionAddresses) {
        isAllowed = false
      }

      if (creatorAddresses && creatorAddresses.length > 0) {
        creatorAddresses.forEach((filterCreator) => {
          if (
            token?.metaplexData?.data?.data?.creators &&
            (token?.metaplexData?.data?.data?.creators).some(
              (c) => c.address === filterCreator.toString() && c.verified
            )
          ) {
            isAllowed = true
          }
        })
      }

      if (collectionAddresses && collectionAddresses.length > 0 && !isAllowed) {
        collectionAddresses.forEach((collectionAddress) => {
          if (
            token.metaplexData?.data?.collection?.verified &&
            token.metaplexData?.data?.collection?.key.toString() ===
              collectionAddress.toString()
          ) {
            isAllowed = true
          }
        })
      }

      if (token.stakeAuthorization) {
        isAllowed = true
      }

      return isAllowed
    })
  }

  const filteredTokens = filterTokens()

  async function handleClaimRewards() {
    if (stakedSelected.length > 4) {
      notify({ message: `Limit of 4 tokens at a time reached`, type: 'error' })
      return
    }
    setLoadingClaimRewards(true)
    if (!wallet) {
      throw new Error('Wallet not connected')
    }
    if (!stakePool) {
      throw new Error('No stake pool detected')
    }

    for (let step = 0; step < stakedSelected.length; step++) {
      try {
        let token = stakedSelected[step]
        if (!token || !token.stakeEntry) {
          throw new Error('No stake entry for token')
        }
        console.log('Claiming rewards...')

        const transaction = await claimRewards(connection, wallet as Wallet, {
          stakePoolId: stakePool.pubkey,
          originalMintId: token.stakeEntry.parsed.originalMint,
        })
        console.log(transaction)
        await executeTransaction(connection, wallet as Wallet, transaction, {})
        notify({ message: `Successfully claimed rewards`, type: 'success' })
        console.log('Successfully claimed rewards')
      } catch (e) {
        notify({ message: `Transaction failed: ${e}`, type: 'error' })
        console.error(e)
      } finally {
        break
      }
    }
    setLoadingClaimRewards(false)
  }
  async function handleUnstake() {
    if (!wallet) {
      throw new Error('Wallet not connected')
    }
    if (!stakePool) {
      throw new Error('No stake pool detected')
    }
    setLoadingUnstake(true)

    for (let step = 0; step < stakedSelected.length; step++) {
      try {
        let token = stakedSelected[step]
        if (!token || !token.stakeEntry) {
          throw new Error('No stake entry for token')
        }
        console.log('Unstaking...')
        const checkMint = new splToken.Token(
          connection,
          token.stakeEntry.parsed.originalMint,
          splToken.TOKEN_PROGRAM_ID,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          null
        )
        let acc = await findAta(
          token.stakeEntry.parsed.originalMint,
          token.stakeEntry.pubkey,
          true
        )
        let a = await checkMint.getAccountInfo(acc)
        console.log(a.amount.toNumber())
        console.log(token.stakeEntry.pubkey.toString(), a.owner.toString())
        console.log(
          a.mint.toString(),
          token.stakeEntry.parsed.originalMint.toString()
        )
        // unstake
        const transaction = await unstake(connection, wallet as Wallet, {
          stakePoolId: stakePool?.pubkey,
          originalMintId: token.stakeEntry.parsed.originalMint,
        })
        await executeTransaction(connection, wallet as Wallet, transaction, {})
        notify({
          message: `Successfully unstaked ${step + 1}/${stakedSelected.length}`,
          type: 'success',
        })
        console.log('Successfully unstaked')
      } catch (e) {
        notify({ message: `Transaction failed: ${e}`, type: 'error' })
        console.error(e)
        break
      }
    }
    refreshTokenAccounts(true)
    refreshStakedTokenDatas(true)
    setLoadingUnstake(false)
  }

  async function handleStake() {
    if (!wallet) {
      throw new Error('Wallet not connected')
    }
    if (!stakePool) {
      throw new Error('No stake pool detected')
    }
    setLoadingStake(true)

    for (let step = 0; step < unstakedSelected.length; step++) {
      try {
        let token = unstakedSelected[step]
        if (!token || !token.tokenAccount) {
          throw new Error('Token account not set')
        }

        if (
          token.tokenAccount?.account.data.parsed.info.tokenAmount.amount > 1 &&
          !token.amountToStake
        ) {
          notify({ message: `Invalid amount chosen for token`, type: 'error' })
          return
        }

        if (token.stakeEntry && token.stakeEntry.parsed.amount.toNumber() > 0) {
          notify({
            message: `'Fungible tokens already staked in the pool. Staked tokens need to be unstaked and then restaked together with the new tokens.'`,
            type: 'error',
          })
          return
        }

        console.log('Creating stake entry and stake mint...')
        const [initTx, , stakeMintKeypair] = await createStakeEntryAndStakeMint(
          connection,
          wallet as Wallet,
          {
            stakePoolId: stakePool?.pubkey,
            originalMintId: new PublicKey(
              token.tokenAccount.account.data.parsed.info.mint
            ),
          }
        )
        if (initTx.instructions.length > 0) {
          await executeTransaction(connection, wallet as Wallet, initTx, {
            signers: stakeMintKeypair ? [stakeMintKeypair] : [],
          })
        }

        console.log('Successfully created stake entry and stake mint')
        console.log('Staking...')
        // stake
        const transaction = await stake(connection, wallet as Wallet, {
          stakePoolId: stakePool?.pubkey,
          receiptType: ReceiptType.Receipt,
          originalMintId: new PublicKey(
            token.tokenAccount.account.data.parsed.info.mint
          ),
          userOriginalMintTokenAccountId: token.tokenAccount?.pubkey,
          amount: token?.amountToStake
            ? new BN(
                token?.amountToStake && token.tokenListData
                  ? getMintNaturalAmountFromDecimal(
                      token?.amountToStake,
                      token.tokenListData?.decimals
                    )
                  : 1
              )
            : undefined,
        })
        await executeTransaction(connection, wallet as Wallet, transaction, {})
        notify({
          message: `Successfully staked ${step + 1}/${unstakedSelected.length}`,
          type: 'success',
        })
        console.log('Successfully staked')
      } catch (e) {
        notify({ message: `Transaction failed: ${e}`, type: 'error' })
        console.error(e)
        break
      }
    }
    refreshTokenAccounts(true)
    refreshStakedTokenDatas(true)
    setLoadingStake(false)
  }

  const isUnstakedTokenSelected = (tk: TokenData) =>
    unstakedSelected.some(
      (utk) =>
        utk.tokenAccount?.account.data.parsed.info.mint.toString() ===
        tk.tokenAccount?.account.data.parsed.info.mint.toString()
    )
  const isStakedTokenSelected = (tk: TokenData) =>
    stakedSelected.some(
      (stk) =>
        stk.stakeEntry?.parsed.originalMint.toString() ===
        tk.stakeEntry?.parsed.originalMint.toString()
    )

  return (
    <div>
      <Head>
        <title>Cardinal Staking UI</title>
        <meta name="description" content="Generated by Cardinal Staking UI" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div>
        <div className="container mx-auto max-h-[90vh] w-full bg-[#1a1b20]">
          <Header />
          {rewardDistributor ? (
            <div className="mx-5 mb-4 flex flex-col rounded-md bg-white bg-opacity-5 p-10 text-gray-200 md:max-h-[100px] md:flex-row md:justify-between">
              <p className="mb-3 mr-10 inline-block text-lg ">
                Total Tokens in Pool: {totalStaked}
              </p>
              {mintInfo ? (
                <>
                  <p className="mb-3 mr-10 mr-2 inline-block text-lg ">
                    Rewards Rate:{' '}
                    {(
                      (Number(
                        getMintDecimalAmountFromNatural(
                          mintInfo!,
                          new BN(rewardDistributor.parsed.rewardAmount)
                        )
                      ) /
                        rewardDistributor.parsed.rewardDurationSeconds.toNumber()) *
                      86400
                    ).toPrecision(3)}{' '}
                    <a
                      className="text-white underline"
                      href={
                        'https://explorer.solana.com/address/' +
                        rewardDistributor.parsed.rewardMint.toString()
                      }
                    >
                      {mintName}
                    </a>{' '}
                    / Day
                  </p>
                  <p className="mb-3 mr-10 mr-2 flex text-lg ">
                    {loadingRewards && (
                      <div className="mr-2">
                        <LoadingSpinner height="25px" />
                      </div>
                    )}
                    Earnings: &nbsp;{claimableRewards.toPrecision(3)} {mintName}{' '}
                  </p>
                </>
              ) : (
                <div className="flex">
                  <div className="mr-2">
                    <LoadingSpinner height="25px" />
                  </div>
                  <p>Loading Pool Rewards Info...</p>
                </div>
              )}
            </div>
          ) : (
            ''
          )}
          <div className="my-2 mx-5 grid h-full grid-cols-1 gap-4 md:grid-cols-2">
            <div className="h-[85vh] max-h-[85vh] flex-col rounded-md bg-white bg-opacity-5 p-10 text-gray-200">
              <div className="mt-2 flex flex-row">
                <p className="mb-3 mr-3 inline-block text-lg">
                  Select Your Tokens
                </p>
                <div className="inline-block">
                  {refreshing && loaded && <LoadingSpinner height="25px" />}
                </div>
              </div>
              {wallet.connected && (
                <div className="my-3 flex-auto overflow-auto">
                  <div className="my-auto mb-4 h-[60vh] overflow-y-auto overflow-x-hidden rounded-md bg-white bg-opacity-5 p-5">
                    {loaded && filteredTokens.length == 0 && (
                      <p className="text-gray-400">
                        No tokens found in wallet.
                      </p>
                    )}
                    {loaded ? (
                      <div className="grid grid-cols-2 gap-1 lg:grid-cols-2 md:gap-4 xl:grid-cols-3">
                        {filteredTokens.map((tk) => (
                          <div
                            className="relative md:w-auto w-44 2xl:w-48"
                            key={tk?.tokenAccount?.pubkey.toBase58()}
                          >
                            <label
                              htmlFor={tk?.tokenAccount?.pubkey.toBase58()}
                              className="relative"
                            >
                              <div className="relative">
                                <div>
                                  <img
                                    className="md:h-40 md:w-40 2xl:h-48 2xl:w-48 mx-auto object-contain mt-4 mb-2 rounded-xl bg-white bg-opacity-5"
                                    src={
                                      tk.metadata?.data.image ||
                                      tk.tokenListData?.logoURI
                                    }
                                    alt={
                                      tk.metadata?.data.name ||
                                      tk.tokenListData?.name
                                    }
                                  />

                                  {tk.tokenListData ? (
                                    <div className="mx-2 flex justify-start">
                                      {/* <div className="float-left mr-2 inline overflow-clip text-ellipsis whitespace-nowrap ">
                                        {tk.tokenListData.name}
                                      </div> */}

                                      <div className="float-left text-ellipsis whitespace-nowrap">
                                        {Number(
                                          (
                                            tk.tokenAccount?.account.data.parsed
                                              .info.tokenAmount.amount /
                                            10 ** tk.tokenListData.decimals
                                          ).toFixed(2)
                                        )}{' '}
                                        {tk.tokenListData.symbol}
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="mx-2 overflow-clip text-ellipsis whitespace-nowrap capitalize text-white">
                                      {tk.metadata?.data?.name}
                                    </p>
                                  )}
                                </div>

                                <input
                                  placeholder={
                                    tk.tokenAccount?.account.data.parsed.info
                                      .tokenAmount.amount > 1
                                      ? '1'
                                      : ''
                                  }
                                  autoComplete="off"
                                  type={
                                    tk.tokenAccount?.account.data.parsed.info
                                      .tokenAmount.amount > 1
                                      ? 'text'
                                      : 'checkbox'
                                  }
                                  className={`absolute h-4 ${
                                    tk.tokenAccount?.account.data.parsed.info
                                      .tokenAmount.amount > 1
                                      ? `w-20 py-3 px-2 text-right`
                                      : 'w-4'
                                  } top-2 right-2 rounded-sm font-medium text-black focus:outline-none`}
                                  id={tk?.tokenAccount?.pubkey.toBase58()}
                                  name={tk?.tokenAccount?.pubkey.toBase58()}
                                  onChange={(e) => {
                                    const amount = Number(e.target.value)
                                    if (
                                      tk.tokenAccount?.account.data.parsed.info
                                        .tokenAmount.amount > 1
                                    ) {
                                      if (
                                        e.target.value.length > 0 &&
                                        !amount
                                      ) {
                                        notify({
                                          message:
                                            'Please enter a valid amount',
                                          type: 'error',
                                        })
                                        setUnstakedSelected(
                                          unstakedSelected.filter(
                                            (data) =>
                                              data.tokenAccount?.account.data.parsed.info.mint.toString() !==
                                              tk.tokenAccount?.account.data.parsed.info.mint.toString()
                                          )
                                        )
                                        return
                                      }
                                      tk.amountToStake = amount
                                    }

                                    if (isUnstakedTokenSelected(tk)) {
                                      setUnstakedSelected(
                                        unstakedSelected.filter(
                                          (data) =>
                                            data.tokenAccount?.account.data.parsed.info.mint.toString() !==
                                            tk.tokenAccount?.account.data.parsed.info.mint.toString()
                                        )
                                      )
                                    } else {
                                      if (
                                        tk.tokenAccount?.account.data.parsed
                                          .info.tokenAmount.amount > 1
                                      ) {
                                        tk.amountToStake = amount
                                      }
                                      setUnstakedSelected([
                                        ...unstakedSelected,
                                        tk,
                                      ])
                                    }
                                  }}
                                />
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-1 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
                        <div className="h-[200px] animate-pulse rounded-lg bg-white bg-opacity-5 p-10"></div>
                        <div className="h-[200px] animate-pulse rounded-lg bg-white bg-opacity-5 p-10"></div>
                        <div className="h-[200px] animate-pulse rounded-lg bg-white bg-opacity-5 p-10"></div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="mt-2 flex flex-row-reverse">
                <button
                  onClick={() => {
                    if (unstakedSelected.length === 0) {
                      notify({
                        message: `No tokens selected`,
                        type: 'error',
                      })
                    }
                    handleStake()
                  }}
                  className="my-auto flex rounded-md bg-blue-700 px-4 py-2"
                >
                  <span className="mr-1 inline-block">
                    {loadingStake && <LoadingSpinner height="25px" />}
                  </span>
                  <span className="my-auto">Stake Tokens</span>
                </button>
              </div>
            </div>
            <div className="h-[85vh] max-h-[85vh] rounded-md bg-white bg-opacity-5 p-10 text-gray-200">
              <div className="mt-2 flex flex-row">
                <p className="mr-3 text-lg">
                  View Staked Tokens{' '}
                  {stakedLoaded && stakedTokenDatas
                    ? `(${stakedTokenDatas.length})`
                    : null}
                </p>
                <div className="inline-block">
                  {stakedRefreshing && stakedLoaded && (
                    <LoadingSpinner height="25px" />
                  )}
                </div>
              </div>
              {wallet.connected && (
                <div className="my-3 flex-auto overflow-auto">
                  <div className="my-auto mb-4 h-[60vh] rounded-md bg-white bg-opacity-5 p-5">
                    {stakedLoaded && stakedTokenDatas.length === 0 && (
                      <p className="text-gray-400">
                        No tokens currently staked.
                      </p>
                    )}
                    {stakedLoaded ? (
                      <div className="grid grid-cols-2 gap-1 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
                        {stakedTokenDatas.map((tk) => (
                          <div
                            className="relative"
                            key={tk?.tokenAccount?.pubkey.toBase58()}
                          >
                            <label
                              htmlFor={tk?.tokenAccount?.pubkey.toBase58()}
                              className="relative"
                            >
                              <div className="relative">
                                <div>
                                  <img
                                    className="mt-2 rounded-lg"
                                    src={
                                      tk.metadata?.data.image ||
                                      tk.tokenListData?.logoURI
                                    }
                                    alt={
                                      tk.metadata?.data.name ||
                                      tk.tokenListData?.name
                                    }
                                  />
                                  {tk.tokenListData ? (
                                    <div className="absolute bottom-2 left-2">
                                      {tk.tokenListData.name}
                                    </div>
                                  ) : (
                                    ''
                                  )}
                                  {tk.tokenListData ? (
                                    <div className="absolute bottom-2 right-2">
                                      {Number(
                                        getMintDecimalAmountFromNaturalV2(
                                          tk.tokenListData!.decimals,
                                          new BN(
                                            tk.stakeEntry!.parsed.amount.toNumber()
                                          )
                                        ).toFixed(2)
                                      )}{' '}
                                      {tk.tokenListData.symbol}
                                    </div>
                                  ) : (
                                    ''
                                  )}
                                </div>

                                <input
                                  placeholder={
                                    tk.stakeEntry!.parsed.amount.toNumber() > 1
                                      ? Number(
                                          getMintDecimalAmountFromNaturalV2(
                                            tk.tokenListData!.decimals,
                                            new BN(
                                              tk.stakeEntry!.parsed.amount.toNumber()
                                            )
                                          ).toFixed(2)
                                        ).toString()
                                      : ''
                                  }
                                  autoComplete="off"
                                  type="checkbox"
                                  className={`absolute top-2 right-2 h-4 w-4 rounded-sm font-medium text-black focus:outline-none`}
                                  id={tk?.stakeEntry?.pubkey.toBase58()}
                                  name={tk?.stakeEntry?.pubkey.toBase58()}
                                  onChange={() => {
                                    if (isStakedTokenSelected(tk)) {
                                      setStakedSelected(
                                        stakedSelected.filter(
                                          (data) =>
                                            data.stakeEntry?.parsed.originalMint.toString() !==
                                            tk.stakeEntry?.parsed.originalMint.toString()
                                        )
                                      )
                                    } else {
                                      setStakedSelected([...stakedSelected, tk])
                                    }
                                  }}
                                />
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-1 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
                        <div className="h-[200px] animate-pulse rounded-lg bg-white bg-opacity-5 p-10"></div>
                        <div className="h-[200px] animate-pulse rounded-lg bg-white bg-opacity-5 p-10"></div>
                        <div className="h-[200px] animate-pulse rounded-lg bg-white bg-opacity-5 p-10"></div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="mt-2 flex flex-row-reverse">
                <button
                  onClick={() => {
                    if (stakedSelected.length === 0) {
                      notify({
                        message: `No tokens selected`,
                        type: 'error',
                      })
                    }
                    handleUnstake()
                  }}
                  className="my-auto flex rounded-md bg-blue-700 px-4 py-2"
                >
                  <span className="mr-1 inline-block">
                    {loadingUnstake ? <LoadingSpinner height="25px" /> : ''}
                  </span>
                  <span className="my-auto">Unstake Tokens</span>
                </button>
                {rewardDistributor ? (
                  <button
                    onClick={() => {
                      if (stakedSelected.length === 0) {
                        notify({
                          message: `No tokens selected`,
                          type: 'error',
                        })
                      }
                      handleClaimRewards()
                    }}
                    className="my-auto mr-5 flex rounded-md bg-blue-700 px-4 py-2"
                  >
                    <span className="mr-1 inline-block">
                      {loadingClaimRewards && <LoadingSpinner height="20px" />}
                    </span>
                    <span className="my-auto">Claim Rewards</span>
                  </button>
                ) : (
                  ''
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
