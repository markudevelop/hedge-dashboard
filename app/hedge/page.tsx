"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { ArrowUpDown, Menu, X, Moon, Sun } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import NavLink from '../components/NavLink';
import Breadcrumbs from '../components/Breadcrumbs';
import useDarkMode from '../hooks/useDarkMode';

type OptionData = {
  instrument_name: string;
  underlying_price: number;
  mark_price: number;
  bid_price: number;
  ask_price: number;
  mark_iv: number;
  underlying_index: string;
  creation_timestamp: number;
  open_interest: number;
  exchange: 'Deribit' | 'Bybit';
};

type MetricValue = {
  display: string;
  raw: number | number[] | string | null;
};

type CalculatedMetrics = {
  // option: OptionData;

  expiryDate: MetricValue;
  strike: MetricValue;
  markPrice: MetricValue;
  bidPrice: MetricValue;
  askPrice: MetricValue;
  contractCost: MetricValue;
  contracts: MetricValue;
  totalCost: MetricValue;
  daysToExpiration: MetricValue;
  impliedVolatility: MetricValue;
  delta: MetricValue;
  gamma: MetricValue;
  vega: MetricValue;
  theta: MetricValue;
  theoreticalPrice: MetricValue;
  optionPrice: MetricValue;
  theoreticalPriceAtTarget: MetricValue;
  hedgeCoverageReturn: MetricValue;
  hedgeEfficiencyScore: MetricValue;
  hedgeEfficiency: MetricValue;
  hedgeEfficiencyPerDay: MetricValue;
  exchange: MetricValue;
  // Spreads
  longStrike?: MetricValue;
  shortStrike?: MetricValue;
  spreadWidth?: MetricValue;
  maxProfit?: MetricValue;
  maxLoss?: MetricValue;
  breakEvenPrice?: MetricValue;
  lowerBreakEven?: MetricValue;
  upperBreakEven?: MetricValue;
};

type Column = {
  key: keyof CalculatedMetrics;
  label: string;
};

type OptionType = 'put' | 'spread' | 'butterfly' | 'ratioBackspread';

const TARGET_PRICE = 0.7; // 30% OTM

const columns: Column[] = [
  { key: 'expiryDate', label: 'Expiry' },
  { key: 'strike', label: 'Strike' },
  { key: 'markPrice', label: 'Mark Price' },
  { key: 'bidPrice', label: 'Bid Price' },
  { key: 'askPrice', label: 'Ask Price' },
  { key: 'optionPrice', label: 'MidPoint Opt Price' },
  { key: 'contractCost', label: 'Contract Cost' },
  { key: 'theoreticalPrice', label: 'Theoretical Price' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'totalCost', label: 'Total Cost' },
  { key: 'theoreticalPriceAtTarget', label: 'Theoretical Price at Target' },
  { key: 'hedgeCoverageReturn', label: 'Hedge Coverage Return' },
  { key: 'daysToExpiration', label: 'Days to Expiry' },
  // Greeks
  { key: 'impliedVolatility', label: 'IV' },
  { key: 'delta', label: 'Delta' },
  { key: 'gamma', label: 'Gamma' },
  { key: 'vega', label: 'Vega' },
  { key: 'theta', label: 'Theta' },
  // Hedge effective rate
  { key: 'hedgeEfficiency', label: 'Hedge Efficiency' },
  { key: 'hedgeEfficiencyPerDay', label: 'Hedge Efficiency Per Day' },
  { key: 'hedgeEfficiencyScore', label: 'Hedge Efficiency Score' },
  // Spreads
  { key: 'longStrike', label: 'Long Strike' },
  { key: 'shortStrike', label: 'Short Strike' },
  { key: 'spreadWidth', label: 'Spread Width' },
  { key: 'maxProfit', label: 'Max Profit' },
  { key: 'maxLoss', label: 'Max Loss' },
  { key: 'breakEvenPrice', label: 'Break Even Price' },
  // Butterflies
  { key: 'lowerBreakEven', label: 'Lower Break Even' },
  { key: 'upperBreakEven', label: 'Upper Break Even' },
];

const OptionsDashboard: React.FC = () => {
  const [currency, setCurrency] = useState('BTC');
  const [optionType, setOptionType] = useState<OptionType>('put');
  const [optionsData, setOptionsData] = useState<OptionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof CalculatedMetrics>('hedgeEfficiencyPerDay');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [btcPrice, setBtcPrice] = useState(0);
  const [investmentAmount, setInvestmentAmount] = useState(1000);
  const [targetPrice, setTargetPrice] = useState(0);
  const [ivIncrease, setIvIncrease] = useState(150); // 20% IV increase by default
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [ratioBackspreadRatio, setRatioBackspreadRatio] = useState(2);

  const { isDarkMode, toggleDarkMode } = useDarkMode();

  useEffect(() => {
    const fetchDeribitData = async () => {
      try {
        const response = await fetch(`https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${currency}&kind=option`);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        if (data.result) {
          const putOptions = data.result
            .filter((option: OptionData) => option.instrument_name.includes('-P'))
            .map((option: OptionData) => ({ ...option, exchange: 'Deribit' as const }));
          return putOptions;
        } else {
          throw new Error('Failed to fetch Deribit options data');
        }
      } catch (err) {
        console.error('Error fetching Deribit data:', err);
        return [];
      }
    };

    const fetchBybitData = async () => {
      try {
        const response = await fetch(`https://api.bybit.com/v5/market/tickers?category=option&baseCoin=${currency}`);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        if (data.result && data.result.list) {
          const putOptions = data.result.list
            .filter((option: any) => option.symbol.includes('-P'))
            .map((option: any) => ({
              instrument_name: option.symbol,
              underlying_price: parseFloat(option.underlyingPrice),
              // mark_price: parseFloat(option.markPrice),
              mark_price: parseFloat(option.markPrice) / parseFloat(option.underlyingPrice), // Convert to BTC/ETH/ETC
              bid_price: parseFloat(option.bid1Price) / parseFloat(option.underlyingPrice), // Convert to BTC/ETH/ETC
              ask_price: parseFloat(option.ask1Price) / parseFloat(option.underlyingPrice), // Convert to BTC/ETH/ETC
              // mark_iv: parseFloat(option.markIv),
              mark_iv: parseFloat(option.markIv) * 100,
              underlying_index: currency,
              creation_timestamp: Date.now(),
              open_interest: parseFloat(option.openInterest),
              exchange: 'Bybit' as const
            }));
          return putOptions;
        } else {
          throw new Error('Failed to fetch Bybit options data');
        }
      } catch (err) {
        console.error('Error fetching Bybit data:', err);
        return [];
      }
    };

    const fetchAllData = async () => {
      setLoading(true);
      try {
        const [deribitOptions, bybitOptions] = await Promise.all([fetchDeribitData(), fetchBybitData()]);
        const allOptions = [...deribitOptions, ...bybitOptions];

        setOptionsData(allOptions);
        if (allOptions.length > 0) {
          setBtcPrice(allOptions[allOptions.length - 1].underlying_price);
          setTargetPrice(allOptions[allOptions.length - 1].underlying_price * TARGET_PRICE);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [currency]);

  const calculateMetrics = useMemo(() => (option: OptionData): CalculatedMetrics | null => {
    const [, expiryDate, strikeStr] = option.instrument_name.split('-');
    const strike = parseFloat(strikeStr);

    // Filter out potentially erroneous data
    if (option.ask_price < 0.0001 || option.bid_price < 0.0001) {
      return null;
    }

    const expiryTimestamp = new Date(expiryDate).getTime();
    const now = Date.now();
    const daysToExpiration = Math.max(0, Math.ceil((expiryTimestamp - now) / (1000 * 60 * 60 * 24)));

    const T = daysToExpiration / 365;
    const r = 0.01; // risk-free rate (assumed)
    const S = option.underlying_price;
    const K = strike;
    const sigma = option.mark_iv / 100;

    const increasedSigma = sigma * (1 + ivIncrease / 100);

    // Black-Scholes calculations
    const d1 = (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const nd1 = cumulativeNormalDistribution(-d1);
    const nd2 = cumulativeNormalDistribution(-d2);

    // Calculate theoretical price using Black-Scholes for put option
    const theoreticalPrice = blackScholesPut(S, K, T, r, sigma);
    const theoreticalPriceAtTargetValue = blackScholesPut(targetPrice, K, T / 2, r, increasedSigma);

    const delta = nd1 - 1;
    const gamma = Math.exp(-Math.pow(d1, 2) / 2) / (S * sigma * Math.sqrt(2 * Math.PI * T));
    const vega = S * Math.sqrt(T) * Math.exp(-Math.pow(d1, 2) / 2) / Math.sqrt(2 * Math.PI) / 100;
    const theta = (-S * sigma * Math.exp(-Math.pow(d1, 2) / 2) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * nd2) / 365;

    // Use bid-ask midpoint
    const optionPrice = (option.ask_price + option.bid_price) / 2;
    // const optionPrice = option.ask_price;

    const contractCost = optionPrice * option.underlying_price;
    const contracts = Math.floor(investmentAmount / contractCost);
    const totalCost = contracts * contractCost;

    if (contracts <= 0) {
      // console.error('Invalid number of contracts:', contracts, 'Investment amount:', investmentAmount, 'Contract cost:', contractCost);
      return null;
    }

    const hedgeCoverageReturn = contracts * theoreticalPriceAtTargetValue;

    const hedgeEfficiency = hedgeCoverageReturn / totalCost;
    const hedgeEfficiencyPerDay = hedgeEfficiency / daysToExpiration;

    const minimumDuration = 30;
    const dailyCost = totalCost / daysToExpiration;
    const durationInDays = Math.min(daysToExpiration, Math.floor(investmentAmount / dailyCost));
    const hedgeEfficiencyScore = (hedgeCoverageReturn / totalCost) * (durationInDays / minimumDuration);

    return {
      // option: {
      //   ...option,
      // },
      expiryDate: { display: expiryDate, raw: expiryTimestamp },
      strike: { display: `$${strike.toLocaleString()}`, raw: strike },
      optionPrice: { display: optionPrice.toFixed(4), raw: optionPrice },
      markPrice: { display: (option.mark_price).toFixed(4), raw: option.mark_price },
      bidPrice: { display: option.bid_price ? (option.bid_price).toFixed(4) : 'N/A', raw: option.bid_price ? option.bid_price * 100 : null },
      askPrice: { display: (option.ask_price).toFixed(4), raw: option.ask_price },
      contractCost: { display: `$${contractCost.toFixed(2)}`, raw: contractCost },
      contracts: { display: contracts.toFixed(2), raw: contracts },
      totalCost: { display: `$${totalCost.toFixed(2)}`, raw: totalCost },
      daysToExpiration: { display: daysToExpiration.toString(), raw: daysToExpiration },
      impliedVolatility: { display: `${(option.mark_iv).toFixed(2)}%`, raw: option.mark_iv },
      delta: { display: delta.toFixed(4), raw: delta },
      gamma: { display: gamma.toFixed(6), raw: gamma },
      vega: { display: vega.toFixed(4), raw: vega },
      theta: { display: theta.toFixed(4), raw: theta },
      theoreticalPrice: { display: `$${theoreticalPrice.toFixed(4)}`, raw: theoreticalPrice },
      theoreticalPriceAtTarget: { display: `$${theoreticalPriceAtTargetValue.toFixed(4)}`, raw: theoreticalPriceAtTargetValue },
      hedgeCoverageReturn: { display: `$${hedgeCoverageReturn.toFixed(2)}`, raw: hedgeCoverageReturn },
      hedgeEfficiency: { display: hedgeEfficiency.toFixed(2), raw: hedgeEfficiency },
      hedgeEfficiencyPerDay: { display: hedgeEfficiencyPerDay.toFixed(4), raw: hedgeEfficiencyPerDay },
      exchange: { display: option.exchange, raw: option.exchange },
      hedgeEfficiencyScore: { display: hedgeEfficiencyScore.toFixed(4), raw: hedgeEfficiencyScore },
    };
  }, [investmentAmount, targetPrice, ivIncrease]);


  const cumulativeNormalDistribution = (x: number): number => {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const z = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p * z);
    const erf = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z));
    return 0.5 * (1 + sign * erf);
  };

  const blackScholesPut = (S: number, K: number, T: number, r: number, sigma: number): number => {
    const d1 = (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return K * Math.exp(-r * T) * cumulativeNormalDistribution(-d2) - S * cumulativeNormalDistribution(-d1);
  };

  const calculateDelta = (S, K, T, r, sigma, optionType) => {
    const d1 = (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
    return optionType === 'call'
      ? cumulativeNormalDistribution(d1)
      : cumulativeNormalDistribution(d1) - 1;
  };

  const calculateGamma = (S, K, T, r, sigma) => {
    const d1 = (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
    return Math.exp(-Math.pow(d1, 2) / 2) / (S * sigma * Math.sqrt(2 * Math.PI * T));
  };

  const calculateVega = (S, K, T, r, sigma) => {
    const d1 = (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
    return S * Math.sqrt(T) * Math.exp(-Math.pow(d1, 2) / 2) / Math.sqrt(2 * Math.PI);
  };

  const calculateTheta = (S, K, T, r, sigma, optionType) => {
    const d1 = (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const term1 = -S * sigma * Math.exp(-Math.pow(d1, 2) / 2) / (2 * Math.sqrt(T));
    const term2 = r * K * Math.exp(-r * T);
    return optionType === 'call'
      ? (term1 - term2 * cumulativeNormalDistribution(d2)) / 365
      : (term1 + term2 * cumulativeNormalDistribution(-d2)) / 365;
  };

  const calculateSpreadMetrics = useMemo(() => (longOption: OptionData, shortOption: OptionData): CalculatedMetrics | null => {
    const [, longExpiryDate] = longOption.instrument_name.split('-');
    const [, shortExpiryDate] = shortOption.instrument_name.split('-');
    if (longExpiryDate !== shortExpiryDate) {
      return null;
    }

    const longStrike = parseFloat(longOption.instrument_name.split('-')[2]);
    const shortStrike = parseFloat(shortOption.instrument_name.split('-')[2]);

    if (isNaN(shortStrike) || isNaN(longStrike) || shortStrike <= longStrike) {
      return null;
    }

    // Check for valid prices
    if (!isValidPrice(longOption.bid_price) || !isValidPrice(longOption.ask_price) ||
      !isValidPrice(shortOption.bid_price) || !isValidPrice(shortOption.ask_price)) {
      return null;
    }

    // Calculate the spread's prices using the API data
    const spreadBid = Math.max(0, shortOption.bid_price - longOption.ask_price);
    const spreadAsk = shortOption.ask_price - longOption.bid_price;
    const netPremium = (spreadBid + spreadAsk) / 2;

    if (netPremium <= 0) {
      return null;
    }

    const spreadWidth = shortStrike - longStrike;
    const underlyingPrice = (longOption.underlying_price + shortOption.underlying_price) / 2;

    const contractCost = netPremium * underlyingPrice;
    const contracts = Math.floor(investmentAmount / contractCost);

    if (contracts <= 0) {
      // console.error('Invalid number of contracts:', contracts, 'Investment amount:', investmentAmount, 'Contract cost:', contractCost);
      return null;
    }

    const totalCost = contracts * contractCost;

    const expiryTimestamp = new Date(longExpiryDate).getTime();
    const now = Date.now();
    const daysToExpiration = Math.max(0, Math.ceil((expiryTimestamp - now) / (1000 * 60 * 60 * 24)));

    const T = daysToExpiration / 365;
    const r = 0.01; // risk-free rate (assumed)
    const S = underlyingPrice;
    // const K = strike;

    const sigmaLong = longOption.mark_iv / 100;
    const sigmaShort = shortOption.mark_iv / 100;

    // Increase IV for target price calculation
    const increasedSigmaLong = sigmaLong * (1 + ivIncrease / 100);
    const increasedSigmaShort = sigmaShort * (1 + ivIncrease / 100);

    const theoreticalPrice = blackScholesPut(S, shortStrike, T, r, sigmaShort) - blackScholesPut(S, longStrike, T, r, sigmaLong);

    // Calculate theoretical price at target using Black-Scholes
    const longPutPriceAtTarget = blackScholesPut(targetPrice, longStrike, T / 2, r, increasedSigmaLong);
    const shortPutPriceAtTarget = blackScholesPut(targetPrice, shortStrike, T / 2, r, increasedSigmaShort);
    const theoreticalPriceAtTarget = shortPutPriceAtTarget - longPutPriceAtTarget;

    const longDelta = calculateDelta(S, longStrike, T, r, sigmaLong, 'put');
    const shortDelta = calculateDelta(S, shortStrike, T, r, sigmaShort, 'put');
    const spreadDelta = longDelta - shortDelta;

    const longGamma = calculateGamma(S, longStrike, T, r, sigmaLong);
    const shortGamma = calculateGamma(S, shortStrike, T, r, sigmaShort);
    const spreadGamma = longGamma - shortGamma;

    const longVega = calculateVega(S, longStrike, T, r, sigmaLong);
    const shortVega = calculateVega(S, shortStrike, T, r, sigmaShort);
    const spreadVega = longVega - shortVega;

    const longTheta = calculateTheta(S, longStrike, T, r, sigmaLong, 'put');
    const shortTheta = calculateTheta(S, shortStrike, T, r, sigmaShort, 'put');
    const spreadTheta = longTheta - shortTheta;

    // Calculate hedge coverage return
    const hedgeCoverageReturn = contracts * theoreticalPriceAtTarget;

    // Calculate hedge efficiency metrics
    const hedgeEfficiency = hedgeCoverageReturn / totalCost;
    const hedgeEfficiencyPerDay = hedgeEfficiency / daysToExpiration;

    const minimumDuration = 30;
    const durationInDays = Math.min(daysToExpiration, minimumDuration);
    const hedgeEfficiencyScore = (hedgeCoverageReturn / totalCost) * (durationInDays / minimumDuration);

    // Calculate max profit, max loss, and break-even price
    const maxProfit = spreadWidth - netPremium;
    const maxLoss = netPremium;
    const breakEvenPrice = shortStrike - netPremium;

    return {
      // longOption,
      // shortOption,
      expiryDate: { display: longExpiryDate, raw: expiryTimestamp },
      strike: { display: `$${shortStrike.toLocaleString()} - $${longStrike.toLocaleString()}`, raw: [shortStrike, longStrike] },
      markPrice: { display: netPremium.toFixed(4), raw: netPremium },
      bidPrice: { display: spreadBid.toFixed(4), raw: spreadBid },
      askPrice: { display: spreadAsk.toFixed(4), raw: spreadAsk },
      optionPrice: { display: netPremium.toFixed(4), raw: netPremium },
      contractCost: { display: `$${contractCost.toFixed(2)}`, raw: contractCost },
      contracts: { display: contracts.toFixed(2), raw: contracts },
      totalCost: { display: `$${totalCost.toFixed(2)}`, raw: totalCost },
      theoreticalPrice: { display: `$${theoreticalPrice.toFixed(4)}`, raw: theoreticalPrice },
      theoreticalPriceAtTarget: { display: `$${theoreticalPriceAtTarget.toFixed(4)}`, raw: theoreticalPriceAtTarget },
      hedgeCoverageReturn: { display: `$${hedgeCoverageReturn.toFixed(2)}`, raw: hedgeCoverageReturn },
      daysToExpiration: { display: daysToExpiration.toString(), raw: daysToExpiration },
      impliedVolatility: { display: `${((longOption.mark_iv + shortOption.mark_iv) / 2).toFixed(2)}%`, raw: (longOption.mark_iv + shortOption.mark_iv) / 2 },
      delta: { display: spreadDelta.toFixed(4), raw: spreadDelta },
      gamma: { display: spreadGamma.toFixed(6), raw: spreadGamma },
      vega: { display: spreadVega.toFixed(4), raw: spreadVega },
      theta: { display: spreadTheta.toFixed(4), raw: spreadTheta },
      hedgeEfficiency: { display: hedgeEfficiency.toFixed(2), raw: hedgeEfficiency },
      hedgeEfficiencyPerDay: { display: hedgeEfficiencyPerDay.toFixed(4), raw: hedgeEfficiencyPerDay },
      hedgeEfficiencyScore: { display: hedgeEfficiencyScore.toFixed(4), raw: hedgeEfficiencyScore },
      maxProfit: { display: `$${maxProfit.toFixed(2)}`, raw: maxProfit },
      maxLoss: { display: `$${maxLoss.toFixed(2)}`, raw: maxLoss },
      breakEvenPrice: { display: `$${breakEvenPrice.toFixed(2)}`, raw: breakEvenPrice },
      exchange: { display: longOption.exchange, raw: longOption.exchange },
      longStrike: { display: `$${longStrike.toLocaleString()}`, raw: longStrike },
      shortStrike: { display: `$${shortStrike.toLocaleString()}`, raw: shortStrike },
      spreadWidth: { display: `$${spreadWidth.toFixed(2)}`, raw: spreadWidth },
    };
  }, [investmentAmount, targetPrice, calculateDelta, calculateGamma, calculateVega, calculateTheta]);

  const getOptionDaysToExpiry = (o) => {
    const [, expiryDateStr] = o.instrument_name.split('-');
    let expiryDate;

    if (/^[0-9]{1,2}[A-Z]{3}[0-9]{2}$/.test(expiryDateStr)) {
      // Deribit format: DMMMYY or DDMMMYY (e.g., 2AUG24 or 27SEP24)
      const day = expiryDateStr.slice(0, expiryDateStr.length - 5);
      const month = expiryDateStr.slice(expiryDateStr.length - 5, expiryDateStr.length - 2);
      const year = expiryDateStr.slice(expiryDateStr.length - 2);
      expiryDate = new Date(`${day} ${month} 20${year}`);
    } else if (/^[0-9]{6}$/.test(expiryDateStr)) {
      // Bybit format: YYMMDD (e.g., 240731)
      const year = expiryDateStr.slice(0, 2);
      const month = expiryDateStr.slice(2, 4);
      const day = expiryDateStr.slice(4, 6);
      expiryDate = new Date(`20${year}-${month}-${day}`);
    } else {
      console.error('Unexpected date format:', o.instrument_name);
      return 0;
    }

    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }

  const filterValidOptions = useMemo(() => (options: OptionData[]): OptionData[] => {
    return options.filter(o => {
      const isValid = o.ask_price && o.bid_price && getOptionDaysToExpiry(o) > 7;
      return isValid;
    });
  }, []);

  const isValidPrice = (price: number): boolean => {
    return typeof price === 'number' && !isNaN(price) && price > 0;
  };


  const calculateButterflyMetrics = useMemo(() => (lowStrikeOption: OptionData, midStrikeOption: OptionData, highStrikeOption: OptionData): CalculatedMetrics | null => {
    const [, expiryDate] = lowStrikeOption.instrument_name.split('-');
    if (expiryDate !== midStrikeOption.instrument_name.split('-')[1] || expiryDate !== highStrikeOption.instrument_name.split('-')[1]) {
      return null;
    }

    const lowStrike = parseFloat(lowStrikeOption.instrument_name.split('-')[2]);
    const midStrike = parseFloat(midStrikeOption.instrument_name.split('-')[2]);
    const highStrike = parseFloat(highStrikeOption.instrument_name.split('-')[2]);

    if (isNaN(lowStrike) || isNaN(midStrike) || isNaN(highStrike) ||
      !(lowStrike < midStrike && midStrike < highStrike) ||
      (midStrike - lowStrike) !== (highStrike - midStrike)) {
      return null;
    }

    // Check for valid prices
    if (!isValidPrice(lowStrikeOption.bid_price) || !isValidPrice(lowStrikeOption.ask_price) ||
      !isValidPrice(midStrikeOption.bid_price) || !isValidPrice(midStrikeOption.ask_price) ||
      !isValidPrice(highStrikeOption.bid_price) || !isValidPrice(highStrikeOption.ask_price)) {
      return null;
    }

    // Calculate the butterfly's prices
    const butterflyBid = Math.max(0, lowStrikeOption.bid_price - 2 * midStrikeOption.ask_price + highStrikeOption.bid_price);
    const butterflyAsk = lowStrikeOption.ask_price - 2 * midStrikeOption.bid_price + highStrikeOption.ask_price;
    const netPremium = (butterflyBid + butterflyAsk) / 2;

    if (netPremium <= 0) {
      return null;
    }

    const underlyingPrice = (lowStrikeOption.underlying_price + midStrikeOption.underlying_price + highStrikeOption.underlying_price) / 3;

    const contractCost = netPremium * underlyingPrice;
    const contracts = Math.floor(investmentAmount / contractCost);

    if (contracts <= 0) {
      return null;
    }

    const totalCost = contracts * contractCost;

    const expiryTimestamp = new Date(expiryDate).getTime();
    const now = Date.now();
    const daysToExpiration = Math.max(0, Math.ceil((expiryTimestamp - now) / (1000 * 60 * 60 * 24)));

    const T = daysToExpiration / 365;
    const r = 0.01; // risk-free rate (assumed)
    const S = underlyingPrice;

    const sigmaLow = lowStrikeOption.mark_iv / 100;
    const sigmaMid = midStrikeOption.mark_iv / 100;
    const sigmaHigh = highStrikeOption.mark_iv / 100;

    // Increase IV for target price calculation
    // const increasedSigmaLow = sigmaLow * (1 + ivIncrease / 100);
    // const increasedSigmaMid = sigmaMid * (1 + ivIncrease / 100);
    // const increasedSigmaHigh = sigmaHigh * (1 + ivIncrease / 100);

    // Calculate theoretical price at target using Black-Scholes
    // const lowPutPriceAtTarget = blackScholesPut(targetPrice, lowStrike, T / 2, r, increasedSigmaLow);
    // const midPutPriceAtTarget = blackScholesPut(targetPrice, midStrike, T / 2, r, increasedSigmaMid);
    // const highPutPriceAtTarget = blackScholesPut(targetPrice, highStrike, T / 2, r, increasedSigmaHigh);

    const lowPutPrice = blackScholesPut(midStrike, lowStrike, 0.00001, r, sigmaLow);
    const midPutPrice = blackScholesPut(midStrike, midStrike, 0.00001, r, sigmaMid);
    const highPutPrice = blackScholesPut(midStrike, highStrike, 0.00001, r, sigmaHigh);

    // const theoreticalPriceAtExpiry = lowPutPrice - 2 * midPutPrice + highPutPrice;
    const theoreticalPriceAtTarget = lowPutPrice - 2 * midPutPrice + highPutPrice - contractCost;

    // const theoreticalPriceAtExpiry = Math.max(0, midStrike - lowStrike) - 2 * Math.max(0, midStrike - midStrike) + Math.max(0, midStrike - highStrike);
    // const theoreticalPriceAtTarget = theoreticalPriceAtExpiry - contractCost;

    // const theoreticalPriceAtTarget = lowPutPriceAtTarget - 2 * midPutPriceAtTarget + highPutPriceAtTarget;
    // const theoreticalPriceAtExpiry = Math.max(0, midStrike - lowStrike) - 2 * Math.max(0, midStrike - midStrike) + Math.max(0, midStrike - highStrike);

    // Calculate Greeks
    const lowDelta = calculateDelta(S, lowStrike, T, r, sigmaLow, 'put');
    const midDelta = calculateDelta(S, midStrike, T, r, sigmaMid, 'put');
    const highDelta = calculateDelta(S, highStrike, T, r, sigmaHigh, 'put');
    const butterflyDelta = lowDelta - 2 * midDelta + highDelta;

    const lowGamma = calculateGamma(S, lowStrike, T, r, sigmaLow);
    const midGamma = calculateGamma(S, midStrike, T, r, sigmaMid);
    const highGamma = calculateGamma(S, highStrike, T, r, sigmaHigh);
    const butterflyGamma = lowGamma - 2 * midGamma + highGamma;

    const lowVega = calculateVega(S, lowStrike, T, r, sigmaLow);
    const midVega = calculateVega(S, midStrike, T, r, sigmaMid);
    const highVega = calculateVega(S, highStrike, T, r, sigmaHigh);
    const butterflyVega = lowVega - 2 * midVega + highVega;

    const lowTheta = calculateTheta(S, lowStrike, T, r, sigmaLow, 'put');
    const midTheta = calculateTheta(S, midStrike, T, r, sigmaMid, 'put');
    const highTheta = calculateTheta(S, highStrike, T, r, sigmaHigh, 'put');
    const butterflyTheta = lowTheta - 2 * midTheta + highTheta;

    // Calculate hedge coverage return
    const hedgeCoverageReturn = contracts * theoreticalPriceAtTarget;

    // Calculate hedge efficiency metrics
    const hedgeEfficiency = hedgeCoverageReturn / totalCost;
    const hedgeEfficiencyPerDay = hedgeEfficiency / daysToExpiration;

    const minimumDuration = 30;
    const durationInDays = Math.min(daysToExpiration, minimumDuration);
    const hedgeEfficiencyScore = (hedgeCoverageReturn / totalCost) * (durationInDays / minimumDuration);

    // Calculate max profit, max loss, and break-even prices
    const maxProfit = midStrike - lowStrike - netPremium;
    const maxLoss = netPremium;
    const lowerBreakEven = lowStrike + netPremium;
    const upperBreakEven = highStrike - netPremium;

    return {
      // option: lowStrikeOption, // Using the low strike option as the base for consistency
      expiryDate: { display: expiryDate, raw: expiryTimestamp },
      strike: { display: `${lowStrike}-${midStrike}-${highStrike}`, raw: [lowStrike, midStrike, highStrike] },
      markPrice: { display: netPremium.toFixed(4), raw: netPremium },
      bidPrice: { display: butterflyBid.toFixed(4), raw: butterflyBid },
      askPrice: { display: butterflyAsk.toFixed(4), raw: butterflyAsk },
      optionPrice: { display: netPremium.toFixed(4), raw: netPremium },
      contractCost: { display: `$${contractCost.toFixed(2)}`, raw: contractCost },
      contracts: { display: contracts.toFixed(2), raw: contracts },
      totalCost: { display: `$${totalCost.toFixed(2)}`, raw: totalCost },
      theoreticalPrice: { display: `$${netPremium.toFixed(4)}`, raw: netPremium },
      theoreticalPriceAtTarget: { display: `$${theoreticalPriceAtTarget.toFixed(4)}`, raw: theoreticalPriceAtTarget },
      hedgeCoverageReturn: { display: `$${hedgeCoverageReturn.toFixed(2)}`, raw: hedgeCoverageReturn },
      daysToExpiration: { display: daysToExpiration.toString(), raw: daysToExpiration },
      impliedVolatility: { display: `${((sigmaLow + sigmaMid + sigmaHigh) / 3 * 100).toFixed(2)}%`, raw: (sigmaLow + sigmaMid + sigmaHigh) / 3 },
      delta: { display: butterflyDelta.toFixed(4), raw: butterflyDelta },
      gamma: { display: butterflyGamma.toFixed(6), raw: butterflyGamma },
      vega: { display: butterflyVega.toFixed(4), raw: butterflyVega },
      theta: { display: butterflyTheta.toFixed(4), raw: butterflyTheta },
      hedgeEfficiency: { display: hedgeEfficiency.toFixed(2), raw: hedgeEfficiency },
      hedgeEfficiencyPerDay: { display: hedgeEfficiencyPerDay.toFixed(4), raw: hedgeEfficiencyPerDay },
      hedgeEfficiencyScore: { display: hedgeEfficiencyScore.toFixed(4), raw: hedgeEfficiencyScore },
      maxProfit: { display: `$${maxProfit.toFixed(2)}`, raw: maxProfit },
      maxLoss: { display: `$${maxLoss.toFixed(2)}`, raw: maxLoss },
      lowerBreakEven: { display: `$${lowerBreakEven.toFixed(2)}`, raw: lowerBreakEven },
      upperBreakEven: { display: `$${upperBreakEven.toFixed(2)}`, raw: upperBreakEven },
      exchange: { display: lowStrikeOption.exchange, raw: lowStrikeOption.exchange },
      longStrike: { display: `$${lowStrike.toLocaleString()}`, raw: lowStrike },
      shortStrike: { display: `$${midStrike.toLocaleString()}`, raw: midStrike },
      spreadWidth: { display: `$${(highStrike - lowStrike).toFixed(2)}`, raw: highStrike - lowStrike },
    };
  }, [investmentAmount, targetPrice, ivIncrease, calculateDelta, calculateGamma, calculateVega, calculateTheta]);

  // const calculateRatioBackspreadMetrics = useMemo(() => (longOption: OptionData, shortOption: OptionData): CalculatedMetrics | null => {
  //   const [, longExpiryDate] = longOption.instrument_name.split('-');
  //   const [, shortExpiryDate] = shortOption.instrument_name.split('-');
  //   if (longExpiryDate !== shortExpiryDate) {
  //     return null;
  //   }

  //   const longStrike = parseFloat(longOption.instrument_name.split('-')[2]);
  //   const shortStrike = parseFloat(shortOption.instrument_name.split('-')[2]);

  //   if (isNaN(shortStrike) || isNaN(longStrike) || shortStrike >= longStrike) {
  //     return null;
  //   }

  //   // Check for valid prices
  //   if (!isValidPrice(longOption.bid_price) || !isValidPrice(longOption.ask_price) ||
  //     !isValidPrice(shortOption.bid_price) || !isValidPrice(shortOption.ask_price)) {
  //     return null;
  //   }

  //   // Calculate the ratio backspread's prices
  //   const longQuantity = ratioBackspreadRatio;
  //   const shortQuantity = 1;
  //   const netCredit = (shortOption.bid_price * shortQuantity) - (longOption.ask_price * longQuantity);

  //   const underlyingPrice = (longOption.underlying_price + shortOption.underlying_price) / 2;

  //   // Calculate maximum loss and maximum profit
  //   const maxLoss = shortStrike - longStrike + netCredit;
  //   const maxProfit = (longStrike * longQuantity) - (shortStrike * shortQuantity) + netCredit;

  //   // Calculate break-even points
  //   const lowerBreakEven = shortStrike - netCredit;
  //   const upperBreakEven = longStrike + (maxLoss / (longQuantity - shortQuantity));

  //   const expiryTimestamp = new Date(longExpiryDate).getTime();
  //   const now = Date.now();
  //   const daysToExpiration = Math.max(0, Math.ceil((expiryTimestamp - now) / (1000 * 60 * 60 * 24)));

  //   const T = daysToExpiration / 365;
  //   const r = 0.01; // risk-free rate (assumed)
  //   const S = underlyingPrice;

  //   const sigmaLong = longOption.mark_iv / 100;
  //   const sigmaShort = shortOption.mark_iv / 100;

  //   // Increase IV for target price calculation
  //   const increasedSigmaLong = sigmaLong * (1 + ivIncrease / 100);
  //   const increasedSigmaShort = sigmaShort * (1 + ivIncrease / 100);

  //   // Calculate theoretical price at target using Black-Scholes
  //   const longPutPriceAtTarget = blackScholesPut(targetPrice, longStrike, T / 2, r, increasedSigmaLong);
  //   const shortPutPriceAtTarget = blackScholesPut(targetPrice, shortStrike, T / 2, r, increasedSigmaShort);
  //   const theoreticalPriceAtTarget = (longPutPriceAtTarget * longQuantity) - (shortPutPriceAtTarget * shortQuantity);

  //   // Calculate Greeks
  //   const longDelta = calculateDelta(S, longStrike, T, r, sigmaLong, 'put');
  //   const shortDelta = calculateDelta(S, shortStrike, T, r, sigmaShort, 'put');
  //   const backspreadDelta = (longDelta * longQuantity) - (shortDelta * shortQuantity);

  //   const longGamma = calculateGamma(S, longStrike, T, r, sigmaLong);
  //   const shortGamma = calculateGamma(S, shortStrike, T, r, sigmaShort);
  //   const backspreadGamma = (longGamma * longQuantity) - (shortGamma * shortQuantity);

  //   const longVega = calculateVega(S, longStrike, T, r, sigmaLong);
  //   const shortVega = calculateVega(S, shortStrike, T, r, sigmaShort);
  //   const backspreadVega = (longVega * longQuantity) - (shortVega * shortQuantity);

  //   const longTheta = calculateTheta(S, longStrike, T, r, sigmaLong, 'put');
  //   const shortTheta = calculateTheta(S, shortStrike, T, r, sigmaShort, 'put');
  //   const backspreadTheta = (longTheta * longQuantity) - (shortTheta * shortQuantity);

  //   // Calculate potential return at target price
  //   const potentialReturnAtTarget = theoreticalPriceAtTarget - netCredit;

  //   // Calculate risk-reward ratio
  //   const riskRewardRatio = maxProfit / maxLoss;

  //   // Calculate a modified hedge efficiency score
  //   const hedgeEfficiencyScore = (potentialReturnAtTarget / maxLoss) * (Math.min(daysToExpiration, 30) / 30);

  //   // const hedgeEfficiencyPerDay = hedgeEfficiency / daysToExpiration;

  //   const totalCost = 0;

  //   return {
  //     expiryDate: { display: longExpiryDate, raw: expiryTimestamp },
  //     strike: { display: `${shortStrike}-${longStrike} (${shortQuantity}:${longQuantity})`, raw: [shortStrike, longStrike] },
  //     markPrice: { display: netCredit.toFixed(4), raw: netCredit },
  //     bidPrice: { display: shortOption.bid_price.toFixed(4), raw: shortOption.bid_price },
  //     askPrice: { display: longOption.ask_price.toFixed(4), raw: longOption.ask_price },
  //     optionPrice: { display: netCredit.toFixed(4), raw: netCredit },
  //     maxLoss: { display: `$${maxLoss.toFixed(2)}`, raw: maxLoss },
  //     maxProfit: { display: `$${maxProfit.toFixed(2)}`, raw: maxProfit },
  //     theoreticalPrice: { display: `$${netCredit.toFixed(4)}`, raw: netCredit },
  //     totalCost: { display: `$${totalCost.toFixed(2)}`, raw: totalCost },
  //     theoreticalPriceAtTarget: { display: `$${theoreticalPriceAtTarget.toFixed(4)}`, raw: theoreticalPriceAtTarget },
  //     potentialReturnAtTarget: { display: `$${potentialReturnAtTarget.toFixed(2)}`, raw: potentialReturnAtTarget },
  //     daysToExpiration: { display: daysToExpiration.toString(), raw: daysToExpiration },
  //     impliedVolatility: { display: `${((sigmaLong + sigmaShort) / 2 * 100).toFixed(2)}%`, raw: (sigmaLong + sigmaShort) / 2 },
  //     delta: { display: backspreadDelta.toFixed(4), raw: backspreadDelta },
  //     gamma: { display: backspreadGamma.toFixed(6), raw: backspreadGamma },
  //     vega: { display: backspreadVega.toFixed(4), raw: backspreadVega },
  //     theta: { display: backspreadTheta.toFixed(4), raw: backspreadTheta },
  //     riskRewardRatio: { display: riskRewardRatio.toFixed(2), raw: riskRewardRatio },
  //     hedgeEfficiencyScore: { display: hedgeEfficiencyScore.toFixed(4), raw: hedgeEfficiencyScore },
  //     lowerBreakEven: { display: `$${lowerBreakEven.toFixed(2)}`, raw: lowerBreakEven },
  //     upperBreakEven: { display: `$${upperBreakEven.toFixed(2)}`, raw: upperBreakEven },
  //     exchange: { display: longOption.exchange, raw: longOption.exchange },
  //     longStrike: { display: `$${longStrike.toLocaleString()}`, raw: longStrike },
  //     shortStrike: { display: `$${shortStrike.toLocaleString()}`, raw: shortStrike },
  //     spreadWidth: { display: `$${(longStrike - shortStrike).toFixed(2)}`, raw: longStrike - shortStrike },
  //   };
  // }, [investmentAmount, targetPrice, ivIncrease, ratioBackspreadRatio, calculateDelta, calculateGamma, calculateVega, calculateTheta]);

  const calculateRatioBackspreadMetrics = useMemo(() => (longOption: OptionData, shortOption: OptionData): CalculatedMetrics | null => {
    const [, longExpiryDate] = longOption.instrument_name.split('-');
    const [, shortExpiryDate] = shortOption.instrument_name.split('-');
    if (longExpiryDate !== shortExpiryDate) {
      return null;
    }

    const longStrike = parseFloat(longOption.instrument_name.split('-')[2]);
    const shortStrike = parseFloat(shortOption.instrument_name.split('-')[2]);

    if (isNaN(shortStrike) || isNaN(longStrike) || shortStrike >= longStrike) {
      return null;
    }

    // Check for valid prices
    if (!isValidPrice(longOption.bid_price) || !isValidPrice(longOption.ask_price) ||
      !isValidPrice(shortOption.bid_price) || !isValidPrice(shortOption.ask_price)) {
      return null;
    }

    // Calculate the ratio backspread's prices
    const longQuantity = ratioBackspreadRatio;
    const shortQuantity = 1;
    const netPremium = (shortOption.bid_price * shortQuantity) - (longOption.ask_price * longQuantity);

    const underlyingPrice = (longOption.underlying_price + shortOption.underlying_price) / 2;

    const contractCost = Math.abs(netPremium) * underlyingPrice;
    const contracts = Math.floor(investmentAmount / contractCost);

    if (contracts <= 0) {
      return null;
    }

    const totalCost = contracts * contractCost;

    const expiryTimestamp = new Date(longExpiryDate).getTime();
    const now = Date.now();
    const daysToExpiration = Math.max(0, Math.ceil((expiryTimestamp - now) / (1000 * 60 * 60 * 24)));

    const T = daysToExpiration / 365;
    const r = 0.01; // risk-free rate (assumed)
    const S = underlyingPrice;

    const sigmaLong = longOption.mark_iv / 100;
    const sigmaShort = shortOption.mark_iv / 100;

    // Increase IV for target price calculation
    const increasedSigmaLong = sigmaLong * (1 + ivIncrease / 100);
    const increasedSigmaShort = sigmaShort * (1 + ivIncrease / 100);

    // Calculate theoretical price at target using Black-Scholes
    const longPutPriceAtTarget = blackScholesPut(targetPrice, longStrike, T / 2, r, increasedSigmaLong);
    const shortPutPriceAtTarget = blackScholesPut(targetPrice, shortStrike, T / 2, r, increasedSigmaShort);
    const theoreticalPriceAtTarget = (longPutPriceAtTarget * longQuantity) - (shortPutPriceAtTarget * shortQuantity);

    // Calculate Greeks
    const longDelta = calculateDelta(S, longStrike, T, r, sigmaLong, 'put');
    const shortDelta = calculateDelta(S, shortStrike, T, r, sigmaShort, 'put');
    const backspreadDelta = (longDelta * longQuantity) - (shortDelta * shortQuantity);

    const longGamma = calculateGamma(S, longStrike, T, r, sigmaLong);
    const shortGamma = calculateGamma(S, shortStrike, T, r, sigmaShort);
    const backspreadGamma = (longGamma * longQuantity) - (shortGamma * shortQuantity);

    const longVega = calculateVega(S, longStrike, T, r, sigmaLong);
    const shortVega = calculateVega(S, shortStrike, T, r, sigmaShort);
    const backspreadVega = (longVega * longQuantity) - (shortVega * shortQuantity);

    const longTheta = calculateTheta(S, longStrike, T, r, sigmaLong, 'put');
    const shortTheta = calculateTheta(S, shortStrike, T, r, sigmaShort, 'put');
    const backspreadTheta = (longTheta * longQuantity) - (shortTheta * shortQuantity);

    // Calculate hedge coverage return
    const hedgeCoverageReturn = contracts * theoreticalPriceAtTarget;

    // Calculate hedge efficiency metrics
    const hedgeEfficiency = hedgeCoverageReturn / totalCost;
    const hedgeEfficiencyPerDay = hedgeEfficiency / daysToExpiration;

    const minimumDuration = 30;
    const durationInDays = Math.min(daysToExpiration, minimumDuration);
    const hedgeEfficiencyScore = (hedgeCoverageReturn / totalCost) * (durationInDays / minimumDuration);

    // Calculate break-even price (approximate)
    const breakEvenPrice = shortStrike - (netPremium / (longQuantity - shortQuantity));

    return {
      expiryDate: { display: longExpiryDate, raw: expiryTimestamp },
      strike: { display: `${shortStrike}-${longStrike} (${shortQuantity}:${longQuantity})`, raw: [shortStrike, longStrike] },
      markPrice: { display: netPremium.toFixed(4), raw: netPremium },
      bidPrice: { display: shortOption.bid_price.toFixed(4), raw: shortOption.bid_price },
      askPrice: { display: longOption.ask_price.toFixed(4), raw: longOption.ask_price },
      optionPrice: { display: netPremium.toFixed(4), raw: netPremium },
      contractCost: { display: `$${contractCost.toFixed(2)}`, raw: contractCost },
      contracts: { display: contracts.toFixed(2), raw: contracts },
      totalCost: { display: `$${totalCost.toFixed(2)}`, raw: totalCost },
      theoreticalPrice: { display: `$${netPremium.toFixed(4)}`, raw: netPremium },
      theoreticalPriceAtTarget: { display: `$${theoreticalPriceAtTarget.toFixed(4)}`, raw: theoreticalPriceAtTarget },
      hedgeCoverageReturn: { display: `$${hedgeCoverageReturn.toFixed(2)}`, raw: hedgeCoverageReturn },
      daysToExpiration: { display: daysToExpiration.toString(), raw: daysToExpiration },
      impliedVolatility: { display: `${((sigmaLong + sigmaShort) / 2 * 100).toFixed(2)}%`, raw: (sigmaLong + sigmaShort) / 2 },
      delta: { display: backspreadDelta.toFixed(4), raw: backspreadDelta },
      gamma: { display: backspreadGamma.toFixed(6), raw: backspreadGamma },
      vega: { display: backspreadVega.toFixed(4), raw: backspreadVega },
      theta: { display: backspreadTheta.toFixed(4), raw: backspreadTheta },
      hedgeEfficiency: { display: hedgeEfficiency.toFixed(2), raw: hedgeEfficiency },
      hedgeEfficiencyPerDay: { display: hedgeEfficiencyPerDay.toFixed(4), raw: hedgeEfficiencyPerDay },
      hedgeEfficiencyScore: { display: hedgeEfficiencyScore.toFixed(4), raw: hedgeEfficiencyScore },
      breakEvenPrice: { display: `$${breakEvenPrice.toFixed(2)}`, raw: breakEvenPrice },
      exchange: { display: longOption.exchange, raw: longOption.exchange },
      longStrike: { display: `$${longStrike.toLocaleString()}`, raw: longStrike },
      shortStrike: { display: `$${shortStrike.toLocaleString()}`, raw: shortStrike },
      spreadWidth: { display: `$${(longStrike - shortStrike).toFixed(2)}`, raw: longStrike - shortStrike },
    };
  }, [investmentAmount, targetPrice, ivIncrease, ratioBackspreadRatio, calculateDelta, calculateGamma, calculateVega, calculateTheta]);


  const generateOptionsData = useMemo(() => (options: OptionData[]): CalculatedMetrics[] => {
    if (optionType === 'put') {
      return options.map(option => calculateMetrics(option)).filter(Boolean);
    } else if (optionType === 'spread') {
      const spreads: CalculatedMetrics[] = [];
      // Group options by expiration date
      const optionsByExpiry = options.reduce((acc, option) => {
        const [, expiryDate] = option.instrument_name.split('-');
        if (!acc[expiryDate]) {
          acc[expiryDate] = [];
        }
        acc[expiryDate].push(option);
        return acc;
      }, {});

      // Generate spreads for each expiration date
      Object.values(optionsByExpiry).forEach((sameExpiryOptions: OptionData[]) => {
        for (let i = 0; i < sameExpiryOptions.length; i++) {
          for (let j = i + 1; j < sameExpiryOptions.length; j++) {
            const option1 = sameExpiryOptions[i];
            const option2 = sameExpiryOptions[j];
            const strike1 = parseFloat(option1.instrument_name.split('-')[2]);
            const strike2 = parseFloat(option2.instrument_name.split('-')[2]);

            if (strike1 > strike2) {
              const spreadMetrics = calculateSpreadMetrics(option2, option1); // Long (lower strike), Short (higher strike)
              if (spreadMetrics) {
                spreads.push(spreadMetrics);
              }
            }
          }
        }
      });
      return spreads;
    } else if (optionType === 'butterfly') {
      const butterflies: CalculatedMetrics[] = [];
      // Group options by expiration date
      const optionsByExpiry = options.reduce((acc, option) => {
        const [, expiryDate] = option.instrument_name.split('-');
        if (!acc[expiryDate]) {
          acc[expiryDate] = [];
        }
        acc[expiryDate].push(option);
        return acc;
      }, {});

      // Generate butterflies for each expiration date
      Object.values(optionsByExpiry).forEach((sameExpiryOptions: OptionData[]) => {
        // Sort options by strike price
        sameExpiryOptions.sort((a, b) => {
          const strikeA = parseFloat(a.instrument_name.split('-')[2]);
          const strikeB = parseFloat(b.instrument_name.split('-')[2]);
          return strikeA - strikeB;
        });

        for (let i = 0; i < sameExpiryOptions.length - 2; i++) {
          const lowStrikeOption = sameExpiryOptions[i];
          const midStrikeOption = sameExpiryOptions[i + 1];
          const highStrikeOption = sameExpiryOptions[i + 2];

          const lowStrike = parseFloat(lowStrikeOption.instrument_name.split('-')[2]);
          const midStrike = parseFloat(midStrikeOption.instrument_name.split('-')[2]);
          const highStrike = parseFloat(highStrikeOption.instrument_name.split('-')[2]);

          // Check if the strikes are equally spaced
          if ((midStrike - lowStrike) === (highStrike - midStrike)) {
            const butterflyMetrics = calculateButterflyMetrics(lowStrikeOption, midStrikeOption, highStrikeOption);
            if (butterflyMetrics) {
              butterflies.push(butterflyMetrics);
            }
          }
        }
      });
      return butterflies;
    } else if (optionType === 'ratioBackspread') {
      const backspreads: CalculatedMetrics[] = [];
      const optionsByExpiry = options.reduce((acc, option) => {
        const [, expiryDate] = option.instrument_name.split('-');
        if (!acc[expiryDate]) {
          acc[expiryDate] = [];
        }
        acc[expiryDate].push(option);
        return acc;
      }, {});

      Object.values(optionsByExpiry).forEach((sameExpiryOptions: OptionData[]) => {
        for (let i = 0; i < sameExpiryOptions.length; i++) {
          for (let j = i + 1; j < sameExpiryOptions.length; j++) {
            const option1 = sameExpiryOptions[i];
            const option2 = sameExpiryOptions[j];
            const strike1 = parseFloat(option1.instrument_name.split('-')[2]);
            const strike2 = parseFloat(option2.instrument_name.split('-')[2]);

            if (strike1 < strike2) {
              const backspreadMetrics = calculateRatioBackspreadMetrics(option2, option1); // Long (higher strike), Short (lower strike)
              if (backspreadMetrics) {
                backspreads.push(backspreadMetrics);
              }
            }
          }
        }
      });
      return backspreads;
    }
  }, [optionType, calculateMetrics, calculateSpreadMetrics]);

  const processOptionsData = useMemo(() => {
    const validOptions = filterValidOptions(optionsData);
    const generatedData = generateOptionsData(validOptions);
    return generatedData.filter(Boolean).sort((a, b) => {
      const aValue = a[sortColumn].raw;
      const bValue = b[sortColumn].raw;

      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1;
      if (bValue === null) return -1;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return 0;
    });
  }, [optionsData, filterValidOptions, generateOptionsData, sortColumn, sortDirection]);

  const sortedData = processOptionsData;

  const handleSort = (column: keyof CalculatedMetrics) => {
    setSortColumn(column);
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const chartData = useMemo(() => sortedData.map(item => ({
    x: item.daysToExpiration.raw,
    y: item.hedgeEfficiencyScore.raw,
    z: item.totalCost.raw,
    name: optionType === 'put'
      ? `${item.expiryDate.display} - $${item.strike.raw}`
      : `${item.expiryDate.display} - $${item.strike.display}`,
  })), [sortedData, optionType]);

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
      <div className="text-2xl text-blue-600 dark:text-blue-400">Loading...</div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
      <div className="text-2xl text-red-600 dark:text-red-400">Error: {error}</div>
    </div>
  );

  return (
    <div className={`flex flex-col min-h-screen ${isDarkMode ? 'dark' : ''}`}>
      <div className="flex-grow bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 text-gray-800 dark:text-white transition-colors duration-300">
        <header className="bg-white bg-opacity-10 dark:bg-gray-800 dark:bg-opacity-30 backdrop-filter backdrop-blur-lg fixed w-full z-10 transition-colors duration-300">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">Crypto Hedge</h1>
            <div className="flex items-center space-x-6">
              <nav className="hidden md:flex space-x-6">
                <NavLink href="/">Home</NavLink>
                <NavLink href="/hedge">Hedging</NavLink>
                <NavLink href="/income">Income</NavLink>
                <NavLink href="/stocks">Stocks</NavLink>
              </nav>
              <button
                onClick={toggleDarkMode}
                className="text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors duration-200"
              >
                {isDarkMode ? <Sun size={24} /> : <Moon size={24} />}
              </button>
              <button
                className="md:hidden text-gray-600 dark:text-gray-300"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </header>

        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 bg-white dark:bg-gray-800 bg-opacity-95 dark:bg-opacity-95 z-20 flex flex-col items-center justify-center space-y-6"
            >
              <NavLink href="/">Home</NavLink>
              <NavLink href="/hedge">Hedging</NavLink>
              <NavLink href="/income">Income</NavLink>
              <NavLink href="/stocks">Stocks</NavLink>
            </motion.div>
          )}
        </AnimatePresence>

        <main className="container mx-auto px-4 pt-24 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-800 dark:text-white">
              Options Analysis <span className="text-blue-600 dark:text-blue-400">Dashboard</span>
            </h2>
          </motion.div>
          <Breadcrumbs items={[
            { label: 'Hedge', href: '/hedge' },
          ]} />

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">Current {currency} Price</h3>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">${btcPrice.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">Select Currency</h3>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
              >
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
                <option value="SOL">SOL</option>
                <option value="XRP">XRP</option>
                <option value="MATIC">MATIC</option>
                <option value="USDC">USDC</option>
              </select>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">Option Type</h3>
              <select
                value={optionType}
                onChange={(e) => setOptionType(e.target.value as OptionType)}
                className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
              >
                <option value="put">Puts</option>
                <option value="spread">Bear Put Spreads</option>
                <option value="butterfly">Butterfly Put Spreads</option>
                <option value="ratioBackspread">Put Ratio Backspread</option>
              </select>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">Investment Amount</h3>
              <input
                type="number"
                value={investmentAmount}
                onChange={(e) => setInvestmentAmount(Number(e.target.value))}
                className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">Target Price</h3>
              <input
                type="number"
                value={targetPrice}
                onChange={(e) => setTargetPrice(Number(e.target.value))}
                className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">IV Increase (%)</h3>
              <input
                type="number"
                value={ivIncrease}
                onChange={(e) => setIvIncrease(Number(e.target.value))}
                className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>
            {optionType === 'ratioBackspread' && (
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">Backspread Ratio</h3>
                <input
                  type="number"
                  value={ratioBackspreadRatio}
                  onChange={(e) => setRatioBackspreadRatio(Number(e.target.value))}
                  min="2"
                  step="1"
                  className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
            )}
          </div>

          <div className="mb-8 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">Hedge Efficiency Score Visualization</h3>
            <ResponsiveContainer width="100%" height={400}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <XAxis type="number" dataKey="x" name="Days to Expiration" unit=" days" />
                <YAxis type="number" dataKey="y" name="Hedge Efficiency Score" unit="" />
                <ZAxis type="number" dataKey="z" range={[50, 1000]} name="Total Cost" unit="$" />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter data={chartData} fill="#3B82F6" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Exchange</th>
                  {columns.map(({ key, label }) => (
                    <th
                      key={key}
                      className="px-4 py-2 text-left cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                      onClick={() => handleSort(key)}
                    >
                      {label} <ArrowUpDown className="inline" size={16} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedData.slice(0, 40).map((option, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-700'}>
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200">{option.exchange.display}</td>
                    {columns.map(({ key }) => (
                      <td key={key} className="px-4 py-2 text-gray-800 dark:text-gray-200">{option[key]?.display}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      <footer className="bg-gray-100 dark:bg-gray-800 py-6 transition-colors duration-300">
        <div className="container mx-auto px-4 text-center text-gray-600 dark:text-gray-400">
          &copy; 2024 Crypto Hedge. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default function Home() {
  return <OptionsDashboard />;
}