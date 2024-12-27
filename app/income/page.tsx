"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { ArrowUpDown, Menu, X, Moon, Sun } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import NavLink from '../components/NavLink';
import Breadcrumbs from '../components/Breadcrumbs';
import useDarkMode from '../hooks/useDarkMode';

// ------------------ Types ------------------
type OptionData = {
  instrument_name: string;
  underlying_price: number;
  mark_price: number;     // in "BTC" (or underlying units) if currency=BTC
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
  raw: number | string | null;
};

type CalculatedMetrics = {
  rawOption: OptionData; // store raw option data
  expiryDate: MetricValue;
  strike: MetricValue;
  markPrice: MetricValue;
  bidPrice: MetricValue;
  askPrice: MetricValue;
  impliedVolatility: MetricValue;
  daysToExpiration: MetricValue;
  annualizedPremium: MetricValue;
  probabilityOTM: MetricValue;
  expectedValue: MetricValue;
  timeDecay: MetricValue;
  totalProfitIfOTM: MetricValue;
  delta: MetricValue;
  gamma: MetricValue;
  vega: MetricValue;
  theta: MetricValue;
  exchange: MetricValue;
};

type Column = {
  key: keyof CalculatedMetrics;
  label: string;
};

type OptionType = 'call' | 'put';

// Positions you hold
type MyPosition = {
  instrumentName: string;   // e.g. "BTC-29DEC23-25000-C"
  side: 'long' | 'short';
  fillPrice: number;        // The price at which you bought or sold
  quantity: number;
};

// --------------- Columns for the Options Table ---------------
const columns: Column[] = [
  { key: 'expiryDate', label: 'Expiry' },
  { key: 'strike', label: 'Strike' },
  { key: 'markPrice', label: 'Mark Price' },
  { key: 'bidPrice', label: 'Bid Price' },
  { key: 'askPrice', label: 'Ask Price' },
  { key: 'impliedVolatility', label: 'IV' },
  { key: 'daysToExpiration', label: 'Days to Expiry' },
  { key: 'annualizedPremium', label: 'Annualized Premium' },
  { key: 'probabilityOTM', label: 'Probability OTM' },
  { key: 'expectedValue', label: 'Expected Value' },
  { key: 'timeDecay', label: 'Time Decay (Theta)' },
  { key: 'totalProfitIfOTM', label: 'Total Profit if OTM' },
];

const PremiumSellingDashboard: React.FC = () => {
  const [currency, setCurrency] = useState('BTC');
  const [optionType, setOptionType] = useState<OptionType>('call');
  const [optionsData, setOptionsData] = useState<OptionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof CalculatedMetrics>('expectedValue');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [underlyingPrice, setUnderlyingPrice] = useState(0);
  const [daysToExpiryFilter, setDaysToExpiryFilter] = useState(45);
  const [minProbabilityOTM, setMinProbabilityOTM] = useState(0.85);
  const [contractQuantity, setContractQuantity] = useState(2.5);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  // ------------- My Positions & Persistence -------------
  const [myPositions, setMyPositions] = useState<MyPosition[]>([]);
  const [positionsLoaded, setPositionsLoaded] = useState(false);
  const [newInstrumentName, setNewInstrumentName] = useState('');
  const [newSide, setNewSide] = useState<'long' | 'short'>('long');
  const [newFillPrice, setNewFillPrice] = useState<number>(0);
  const [newQuantity, setNewQuantity] = useState<number>(1);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedPositions = localStorage.getItem('myPositions');
      if (storedPositions) {
        setMyPositions(JSON.parse(storedPositions));
      }

      setPositionsLoaded(true);
    }
  }, []);

  // Only write to localStorage if we have some positions
  useEffect(() => {
    if (!positionsLoaded) return;  // skip until we've loaded existing data

    if (myPositions.length === 0) {
      // Remove from localStorage only if the user truly has no positions
      localStorage.removeItem('myPositions');
    } else {
      localStorage.setItem('myPositions', JSON.stringify(myPositions));
    }
  }, [myPositions, positionsLoaded]);
  // ------------------------------------------------------

  useEffect(() => {
    const fetchOptionsData = async () => {
      setLoading(true);
      try {
        const [deribitData, bybitData] = await Promise.all([
          fetchDeribitData(),
          fetchBybitData()
        ]);
        const allOptions = [...deribitData, ...bybitData];
        setOptionsData(allOptions);

        // Grab an underlying price from either Bybit or Deribit
        if (allOptions.length > 0) {
          if (bybitData.length > 0) {
            setUnderlyingPrice(bybitData[0].underlying_price);
          } else if (deribitData.length > 0) {
            setUnderlyingPrice(deribitData[0].underlying_price);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };
    fetchOptionsData();
  }, [currency, optionType]);

  const fetchDeribitData = async () => {
    try {
      const response = await fetch(
        `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${currency}&kind=option`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      if (data.result) {
        return data.result
          .filter((option: OptionData) =>
            // option.instrument_name.includes(optionType === 'call' ? '-C' : '-P')
            true
          )
          .map((option: OptionData) => ({
            ...option,
            exchange: 'Deribit' as const
          }));
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
      const response = await fetch(
        `https://api.bybit.com/v5/market/tickers?category=option&baseCoin=${currency}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      if (data.result && data.result.list) {
        return data.result.list
          .filter((option: any) =>
            // option.symbol.includes(optionType === 'call' ? '-C' : '-P')
            true
          )
          .map((option: any) => ({
            instrument_name: option.symbol,
            underlying_price: parseFloat(option.underlyingPrice),
            mark_price: parseFloat(option.markPrice) / parseFloat(option.underlyingPrice),
            bid_price: parseFloat(option.bid1Price) / parseFloat(option.underlyingPrice),
            ask_price: parseFloat(option.ask1Price) / parseFloat(option.underlyingPrice),
            mark_iv: parseFloat(option.markIv) * 100,
            underlying_index: currency,
            creation_timestamp: Date.now(),
            open_interest: parseFloat(option.openInterest),
            exchange: 'Bybit' as const
          }));
      } else {
        throw new Error('Failed to fetch Bybit options data');
      }
    } catch (err) {
      console.error('Error fetching Bybit data:', err);
      return [];
    }
  };

  // -------------------- Calculations ---------------------
  const calculateMetrics = useMemo(
    () => (option: OptionData): CalculatedMetrics | null => {
      const [, expiryDate, strikeStr] = option.instrument_name.split('-');
      const strike = parseFloat(strikeStr);

      // Filter out illiquid or invalid quotes
      if (option.ask_price < 0.0001 || option.bid_price < 0.0001) {
        return null;
      }

      const expiryTimestamp = new Date(expiryDate).getTime();
      const daysToExpiration = getOptionDaysToExpiry(option);

      const T = daysToExpiration / 365;
      const r = 0.01; // risk-free rate
      const S = option.underlying_price;
      const K = strike;
      const sigma = option.mark_iv / 100;

      // We'll assume for "selling" side we look at the bid price
      const optionPrice = option.bid_price;

      // Annualized premium
      const annualizedPremium = (optionPrice / K) * (365 / daysToExpiration);

      // Probability OTM
      const d1 = (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
      const d2 = d1 - sigma * Math.sqrt(T);
      const probabilityOTM =
        optionType === 'call'
          ? cumulativeNormalDistribution(-d2)
          : cumulativeNormalDistribution(d2);

      // Expected Value
      const expectedValue = optionPrice - (1 - probabilityOTM) * Math.abs(S - K);

      // Profit if OTM
      const totalProfitIfOTM = optionPrice * S * contractQuantity;

      // Greeks
      const nd1 = Math.exp(-Math.pow(d1, 2) / 2) / Math.sqrt(2 * Math.PI);
      const delta =
        optionType === 'call'
          ? cumulativeNormalDistribution(d1)
          : cumulativeNormalDistribution(d1) - 1;
      const gamma = nd1 / (S * sigma * Math.sqrt(T));
      const vega = (S * nd1 * Math.sqrt(T)) / 100;
      const theta = calculateTheta(S, K, T, r, sigma, optionType);

      return {
        rawOption: option,
        expiryDate: { display: expiryDate, raw: expiryTimestamp },
        strike: { display: `$${strike.toLocaleString()}`, raw: strike },
        markPrice: { display: option.mark_price.toFixed(4), raw: option.mark_price },
        bidPrice: { display: option.bid_price.toFixed(4), raw: option.bid_price },
        askPrice: { display: option.ask_price.toFixed(4), raw: option.ask_price },
        impliedVolatility: { display: `${option.mark_iv.toFixed(2)}%`, raw: option.mark_iv },
        daysToExpiration: { display: daysToExpiration.toFixed(2), raw: daysToExpiration },
        annualizedPremium: {
          display: `${(annualizedPremium * 100).toFixed(2)}%`,
          raw: annualizedPremium
        },
        probabilityOTM: {
          display: `${(probabilityOTM * 100).toFixed(2)}%`,
          raw: probabilityOTM
        },
        expectedValue: { display: expectedValue.toFixed(4), raw: expectedValue },
        timeDecay: { display: theta.toFixed(6), raw: theta },
        totalProfitIfOTM: { display: totalProfitIfOTM.toFixed(2), raw: totalProfitIfOTM },
        delta: { display: delta.toFixed(4), raw: delta },
        gamma: { display: gamma.toFixed(6), raw: gamma },
        vega: { display: vega.toFixed(4), raw: vega },
        theta: { display: theta.toFixed(6), raw: theta },
        exchange: { display: option.exchange, raw: option.exchange }
      };
    },
    [optionType, currency, contractQuantity]
  );

  const cumulativeNormalDistribution = (x: number): number => {
    // Approximation constants
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const z = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + p * z);
    const erf =
      1 -
      (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
        t *
        Math.exp(-z * z));
    return 0.5 * (1 + sign * erf);
  };

  const calculateTheta = (
    S: number,
    K: number,
    T: number,
    r: number,
    sigma: number,
    optionType: OptionType
  ): number => {
    const d1 = (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const nd1 = Math.exp(-Math.pow(d1, 2) / 2) / Math.sqrt(2 * Math.PI);

    if (optionType === 'call') {
      return (
        (-S * sigma * nd1) / (2 * Math.sqrt(T)) -
        r * K * Math.exp(-r * T) * cumulativeNormalDistribution(d2)
      ) / 365;
    } else {
      return (
        (-S * sigma * nd1) / (2 * Math.sqrt(T)) +
        r * K * Math.exp(-r * T) * cumulativeNormalDistribution(-d2)
      ) / 365;
    }
  };

  const filterValidOptions = (options: OptionData[]): OptionData[] => {
    return options.filter((o) => {
      const daysToExpiry = getOptionDaysToExpiry(o);
      return o.ask_price && o.bid_price && daysToExpiry <= daysToExpiryFilter;
    });
  };

  const getOptionDaysToExpiry = (o: OptionData): number => {
    const [, expiryDateStr] = o.instrument_name.split('-');
    let expiryDate: Date;

    if (/^[0-9]{1,2}[A-Z]{3}[0-9]{2}$/.test(expiryDateStr)) {
      // Deribit format: e.g. 2AUG24 or 27SEP24
      const day = expiryDateStr.slice(0, expiryDateStr.length - 5);
      const month = expiryDateStr.slice(
        expiryDateStr.length - 5,
        expiryDateStr.length - 2
      );
      const year = expiryDateStr.slice(expiryDateStr.length - 2);
      expiryDate = new Date(`${day} ${month} 20${year} 08:00:00 UTC`);
    } else if (/^[0-9]{6}$/.test(expiryDateStr)) {
      // Bybit format: e.g. 240731 (YYMMDD)
      const year = expiryDateStr.slice(0, 2);
      const month = expiryDateStr.slice(2, 4);
      const day = expiryDateStr.slice(4, 6);
      expiryDate = new Date(`20${year}-${month}-${day}T08:00:00Z`);
    } else {
      console.error('Unexpected date format:', o.instrument_name);
      return 0;
    }

    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return Math.max(0, diffDays);
  };

  const allCalculatedData = useMemo(() => {
    return optionsData
      .map((option) => calculateMetrics(option))
      .filter(Boolean) as CalculatedMetrics[];
  }, [optionsData, calculateMetrics]);

  const processOptionsData = useMemo(() => {
    const validOptions = filterValidOptions(optionsData);
    const calculatedData = validOptions
      .map((option) => calculateMetrics(option))
      .filter(Boolean) as CalculatedMetrics[];

    return calculatedData
      .filter((option) => (option.probabilityOTM.raw as number) >= minProbabilityOTM)
      .sort((a: any, b: any) => {
        const aValue = a[sortColumn].raw;
        const bValue = b[sortColumn].raw;

        if (aValue === null && bValue === null) return 0;
        if (aValue === null) return 1;
        if (bValue === null) return -1;

        return sortDirection === 'asc'
          ? Number(aValue) - Number(bValue)
          : Number(bValue) - Number(aValue);
      });
  }, [optionsData, calculateMetrics, sortColumn, sortDirection, minProbabilityOTM]);

  const sortedData = processOptionsData;

  const handleSort = (column: keyof CalculatedMetrics) => {
    setSortColumn(column);
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  // ---------------- Scatter Chart Data -----------------
  const chartData = useMemo(
    () =>
      sortedData.map((item) => ({
        x: item.timeDecay.raw,
        y: item.expectedValue.raw,
        z: item.annualizedPremium.raw,
        name: `${item.expiryDate.display} - $${item.strike.raw}`,
      })),
    [sortedData]
  );

  // -------------- Add new position handler -------------
  const handleAddPosition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstrumentName || newFillPrice <= 0 || newQuantity <= 0) {
      alert('Please enter valid inputs for your position.');
      return;
    }
    const newPos: MyPosition = {
      instrumentName: newInstrumentName.trim().toUpperCase(), // e.g. "BTC-29DEC23-25000-C"
      side: newSide,
      fillPrice: newFillPrice,
      quantity: newQuantity,
    };
    setMyPositions((prev) => [...prev, newPos]);
    setNewInstrumentName('');
    setNewSide('long');
    setNewFillPrice(0);
    setNewQuantity(1);
  };

  // ----------------- Delete a position -----------------
  const handleDeletePosition = (index: number) => {
    setMyPositions((prev) => prev.filter((_, i) => i !== index));
  };

  // ----------------- Calculate Open PnL ----------------
  const getOpenPnlBtc = (pos: MyPosition): number => {
    const match = allCalculatedData.find(
      (opt) => opt.rawOption.instrument_name === pos.instrumentName
    );
    if (!match) return 0;
    const currentMarkPrice = match.markPrice.raw as number;

    if (pos.side === 'long') {
      return (currentMarkPrice - pos.fillPrice) * pos.quantity;
    } else {
      return (pos.fillPrice - currentMarkPrice) * pos.quantity;
    }
  };

  // PnL in USD => multiply openPnl in BTC by the underlying BTC price
  const getOpenPnlUsd = (pos: MyPosition): number => {
    const openPnlBtc = getOpenPnlBtc(pos);
    return openPnlBtc * underlyingPrice;
  };

  // PnL % => [openPnlBtc / (fillPrice * quantity)] * 100
  const getOpenPnlPercent = (pos: MyPosition): number => {
    const costBtc = pos.fillPrice * pos.quantity;
    if (costBtc <= 0) return 0;
    return (getOpenPnlBtc(pos) / costBtc) * 100;
  };

  // -------------- Render --------------
  if (loading)
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
        <div className="text-2xl text-blue-600 dark:text-blue-400">Loading...</div>
      </div>
    );

  if (error)
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
        <div className="text-2xl text-red-600 dark:text-red-400">Error: {error}</div>
      </div>
    );

  return (
    <div className={`flex flex-col min-h-screen ${isDarkMode ? 'dark' : ''}`}>
      <div className="flex-grow bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 text-gray-800 dark:text-white transition-colors duration-300">
        {/* HEADER */}
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

        {/* MOBILE MENU */}
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

        {/* MAIN CONTENT */}
        <main className="container mx-auto px-4 pt-24 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-800 dark:text-white">
              Premium Selling <span className="text-blue-600 dark:text-blue-400">Dashboard</span>
            </h2>
          </motion.div>

          <Breadcrumbs items={[{ label: 'Income', href: '/income' }]} />

          {/* TOP CONTROLS */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">
                Current {currency} Price
              </h3>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                ${underlyingPrice.toLocaleString()}
              </p>
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
              </select>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">Option Type</h3>
              <select
                value={optionType}
                onChange={(e) => setOptionType(e.target.value as OptionType)}
                className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
              >
                <option value="call">Calls</option>
                <option value="put">Puts</option>
              </select>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">Max Days to Expiry</h3>
              <input
                type="number"
                value={daysToExpiryFilter}
                onChange={(e) => setDaysToExpiryFilter(Number(e.target.value))}
                className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">Min Probability OTM</h3>
              <input
                type="number"
                value={minProbabilityOTM}
                onChange={(e) => setMinProbabilityOTM(Number(e.target.value))}
                min="0"
                max="1"
                step="0.05"
                className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">Contract Quantity</h3>
              <input
                type="number"
                value={contractQuantity}
                onChange={(e) => setContractQuantity(Number(e.target.value))}
                className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>
          </div>

          {/* SCATTER CHART */}
          <div className="mb-8 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">
              Expected Value vs Time Decay
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <XAxis type="number" dataKey="x" name="Time Decay (Theta)" unit="$" />
                <YAxis type="number" dataKey="y" name="Expected Value" unit="$" />
                <ZAxis
                  type="number"
                  dataKey="z"
                  range={[50, 1000]}
                  name="Annualized Premium"
                  unit="%"
                />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                <Scatter data={chartData} fill="#3B82F6" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* -------------- MY OPEN POSITIONS -------------- */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md mb-8">
            <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">My Open Options</h3>

            {/* Form to add positions */}
            <form
              onSubmit={handleAddPosition}
              className="mb-4 flex flex-col md:flex-row md:items-end md:space-x-4"
            >
              <div className="mb-2 md:mb-0">
                <label
                  className="block text-gray-700 dark:text-gray-300 mb-1"
                  htmlFor="instrumentName"
                >
                  Instrument Name
                </label>
                <input
                  id="instrumentName"
                  type="text"
                  value={newInstrumentName}
                  onChange={(e) => setNewInstrumentName(e.target.value)}
                  className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
                  placeholder="e.g. BTC-29DEC23-25000-C"
                />
              </div>
              <div className="mb-2 md:mb-0">
                <label
                  className="block text-gray-700 dark:text-gray-300 mb-1"
                  htmlFor="side"
                >
                  Side
                </label>
                <select
                  id="side"
                  value={newSide}
                  onChange={(e) => setNewSide(e.target.value as 'long' | 'short')}
                  className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
                >
                  <option value="long">Long</option>
                  <option value="short">Short</option>
                </select>
              </div>
              <div className="mb-2 md:mb-0">
                <label
                  className="block text-gray-700 dark:text-gray-300 mb-1"
                  htmlFor="fillPrice"
                >
                  Fill Price (BTC)
                </label>
                <input
                  id="fillPrice"
                  type="number"
                  step="any"
                  value={newFillPrice}
                  onChange={(e) => setNewFillPrice(Number(e.target.value))}
                  className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
                  placeholder="e.g. 0.0123"
                />
              </div>
              <div className="mb-2 md:mb-0">
                <label
                  className="block text-gray-700 dark:text-gray-300 mb-1"
                  htmlFor="quantity"
                >
                  Quantity
                </label>
                <input
                  id="quantity"
                  type="number"
                  step="any"
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(Number(e.target.value))}
                  className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
                  placeholder="e.g. 1"
                />
              </div>
              <div>
                <button
                  type="submit"
                  className="mt-4 md:mt-0 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                >
                  Add Position
                </button>
              </div>
            </form>

            {/* Table of myPositions */}
            {myPositions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-700">
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                        Instrument
                      </th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                        Side
                      </th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                        Fill Price (BTC)
                      </th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                        Quantity
                      </th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                        Current Mark (BTC)
                      </th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                        Premium Collected (BTC/USD)
                      </th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                        PnL (BTC)
                      </th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                        PnL (USD)
                      </th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                        PnL %
                      </th>
                      {/* NEW: Delete Column */}
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {myPositions.map((pos, idx) => {
                      const match = allCalculatedData.find(
                        (opt) => opt.rawOption.instrument_name === pos.instrumentName
                      );
                      const currentMark = match?.markPrice.raw ?? 0;
                      const openPnlBtc = getOpenPnlBtc(pos);
                      const openPnlUsd = getOpenPnlUsd(pos);
                      const openPnlPercent = getOpenPnlPercent(pos);

                      // Calculate Total Premium in BTC
                      const getTotalPremiumBtc = (): number => {
                        return pos.fillPrice * pos.quantity;
                      };

                      // Calculate Total Premium in USD
                      const getTotalPremiumUsd = (): number => {
                        const totalPremiumBtc = getTotalPremiumBtc();
                        return totalPremiumBtc * underlyingPrice;
                      };

                      return (
                        <tr
                          key={idx}
                          className={
                            idx % 2 === 0
                              ? 'bg-gray-50 dark:bg-gray-800'
                              : 'bg-white dark:bg-gray-700'
                          }
                        >
                          <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                            {pos.instrumentName}
                          </td>
                          <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                            {pos.side}
                          </td>
                          <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                            {pos.fillPrice.toFixed(4)}
                          </td>
                          <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                            {pos.quantity}
                          </td>
                          <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                            {Number(currentMark).toFixed(4)}
                          </td>
                          {/* Total Premium */}
                          <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                            {getTotalPremiumBtc().toFixed(4)} / {getTotalPremiumUsd().toFixed(2)}
                          </td>
                          {/* PnL (BTC) */}
                          <td
                            className={`px-4 py-2 ${openPnlBtc >= 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                              }`}
                          >
                            {openPnlBtc.toFixed(4)}
                          </td>
                          {/* PnL (USD) */}
                          <td
                            className={`px-4 py-2 ${openPnlUsd >= 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                              }`}
                          >
                            {openPnlUsd.toFixed(2)}
                          </td>
                          {/* PnL (%) */}
                          <td
                            className={`px-4 py-2 ${openPnlPercent >= 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                              }`}
                          >
                            {openPnlPercent.toFixed(2)}%
                          </td>
                          {/* DELETE BUTTON */}
                          <td className="px-4 py-2">
                            <button
                              onClick={() => handleDeletePosition(idx)}
                              className="text-red-500 hover:underline"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-800 dark:text-gray-300">No open positions yet.</p>
            )}
          </div>
          {/* -------------- END MY OPEN POSITIONS -------------- */}

          {/* OPTIONS TABLE */}
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
                  <tr
                    key={index}
                    className={
                      index % 2 === 0
                        ? 'bg-gray-50 dark:bg-gray-800'
                        : 'bg-white dark:bg-gray-700'
                    }
                  >
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                      {option.exchange.display}
                    </td>
                    {columns.map(({ key }) => (
                      <td key={key} className="px-4 py-2 text-gray-800 dark:text-gray-200">
                        {option[key as any]?.display}
                      </td>
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

export default PremiumSellingDashboard;
