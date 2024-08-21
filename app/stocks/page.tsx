"use client"

import React, { useState, useEffect, useMemo } from 'react';
import { ArrowUpDown, Shield, DollarSign, TrendingUp, Menu, X, Moon, Sun } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import NavLink from '../components/NavLink';
import Breadcrumbs from '../components/Breadcrumbs';
import useDarkMode from '../hooks/useDarkMode';
import { cumulativeNormalDistribution, blackScholesPut, blackScholesCall } from '../utils/options'

const TARGET_PRICE = 0.7; // 30% OTM

// Hardcoded API credentials
const API_KEY = 'AKI6DSI3A1BXI3LSDA8A';
const API_SECRET = 'OFeVrjr1ShXqrvVnyXwRl5e8s8OraPZYffL91BdQ';

type StockOptionData = {
  symbol: string;
  expiration_date: string;
  strike_price: number;
  option_type: 'put' | 'call';
  bid: number;
  ask: number;
  last: number;
  volume: number;
  open_interest: number;
  underlying_price: number;
  greeks: {
    delta: number;
    gamma: number;
    rho: number;
    theta: number;
    vega: number;
  };
  impliedVolatility: number;
  latestQuote: {
    ap: number;
    as: number;
    ax: string;
    bp: number;
    bs: number;
    bx: string;
    c: string;
    t: string;
  };
  latestTrade: {
    c: string;
    p: number;
    s: number;
    t: string;
    x: string;
  };
};

type MetricValue = {
  display: string;
  raw: number | null;
};

type CalculatedMetrics = {
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
};

type Column = {
  key: keyof CalculatedMetrics;
  label: string;
};

const columns: Column[] = [
  { key: 'expiryDate', label: 'Expiry' },
  { key: 'strike', label: 'Strike' },
  { key: 'markPrice', label: 'Mark Price' },
  { key: 'bidPrice', label: 'Bid Price' },
  { key: 'askPrice', label: 'Ask Price' },
  { key: 'contractCost', label: 'Contract Cost' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'totalCost', label: 'Total Cost' },
  { key: 'theoreticalPrice', label: 'Theoretical Price' },
  { key: 'theoreticalPriceAtTarget', label: 'Theoretical Price at Target' },
  { key: 'hedgeCoverageReturn', label: 'Hedge Coverage Return' },
  { key: 'daysToExpiration', label: 'Days to Expiry' },
  { key: 'optionPrice', label: 'MidPoint Opt Price' },
  { key: 'impliedVolatility', label: 'IV' },
  { key: 'delta', label: 'Delta' },
  { key: 'gamma', label: 'Gamma' },
  { key: 'vega', label: 'Vega' },
  { key: 'theta', label: 'Theta' },
  { key: 'hedgeEfficiencyScore', label: 'Hedge Efficiency Score' },
];


const StockOptionsDashboard: React.FC = () => {
  const [optionsData, setOptionsData] = useState<StockOptionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof CalculatedMetrics>('hedgeCoverageReturn');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [underlyingPrice, setUnderlyingPrice] = useState(0);
  const [investmentAmount, setInvestmentAmount] = useState(1000);
  const [targetPrice, setTargetPrice] = useState(0);
  const [ivIncrease, setIvIncrease] = useState(150);
  const [ticker, setTicker] = useState('BITO');

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  useEffect(() => {
    const fetchAlpacaData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch the current price of the underlying asset
        const quoteResponse = await fetch(`https://data.alpaca.markets/v2/stocks/${ticker}/quotes/latest`, {
          headers: {
            'APCA-API-KEY-ID': API_KEY,
            'APCA-API-SECRET-KEY': API_SECRET,
          },
        });

        if (!quoteResponse.ok) {
          throw new Error(`HTTP error! status: ${quoteResponse.status} while fetching quote`);
        }

        const quoteData = await quoteResponse.json();
        const currentPrice = (quoteData.quote.ap + quoteData.quote.bp) / 2;
        setUnderlyingPrice(currentPrice);
        setTargetPrice(currentPrice * TARGET_PRICE);

        // Fetch options data
        const optionsResponse = await fetch(`https://data.alpaca.markets/v1beta1/options/snapshots/${ticker}?feed=indicative&limit=1000`, {
          headers: {
            'APCA-API-KEY-ID': API_KEY,
            'APCA-API-SECRET-KEY': API_SECRET,
          },
        });

        if (!optionsResponse.ok) {
          throw new Error(`HTTP error! status: ${optionsResponse.status} while fetching options`);
        }

        const optionsData = await optionsResponse.json();
        setOptionsData(optionsData.snapshots);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error("Error details:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAlpacaData();
  }, [ticker]);

  const handleSort = (column: keyof CalculatedMetrics) => {
    setSortColumn(column);
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  const calculateMetrics = (
    optionKey: string,
    option: StockOptionData,
    underlyingPrice: number,
    investmentAmount: number,
    targetPrice: number,
    ivIncrease: number
  ): CalculatedMetrics => {
    const symbol = optionKey.slice(0, 4); // e.g., "BITO"
    const year = parseInt(optionKey.slice(4, 6)) + 2000; // e.g., "24" -> 2024
    const month = parseInt(optionKey.slice(6, 8)); // e.g., "08"
    const day = parseInt(optionKey.slice(8, 10)); // e.g., "23"
    const optionType = optionKey.charAt(10) === 'C' ? 'C' : 'P';
    const strike = parseFloat(optionKey.slice(11)) / 1000; // e.g., "00019500" -> 19.5

    const expiryDate = new Date(year, month - 1, day); // month is 0-indexed in JS Date
    const now = new Date();
    const daysToExpiration = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    const T = daysToExpiration / 365;
    const r = 0.01; // Risk-free rate (assumed)
    const S = underlyingPrice;
    const K = strike;

    // Use the implied volatility from the API response
    const sigma = option.impliedVolatility || 0.3; // If IV is not provided, fallback to 0.3

    const increasedSigma = sigma * (1 + ivIncrease / 100);

    // Use bid-ask midpoint for option price
    const optionPrice = (option.latestQuote.ap + option.latestQuote.bp) / 2;

    const theoreticalPrice = optionType === 'P'
      ? blackScholesPut(S, K, T, r, sigma)
      : blackScholesCall(S, K, T, r, sigma);

    const theoreticalPriceAtTargetValue = optionType === 'P'
      ? blackScholesPut(targetPrice, K, T / 2, r, increasedSigma)
      : blackScholesCall(targetPrice, K, T / 2, r, increasedSigma);

    const contractCost = optionPrice * 100; // Assuming each contract is for 100 shares
    const contracts = Math.floor(investmentAmount / contractCost);
    const totalCost = contracts * contractCost;

    const hedgeCoverageReturn = contracts * theoreticalPriceAtTargetValue * 100;

    const hedgeEfficiency = hedgeCoverageReturn / totalCost;
    const hedgeEfficiencyPerDay = hedgeEfficiency / daysToExpiration;

    const minimumDuration = 30;
    const dailyCost = totalCost / daysToExpiration;
    const durationInDays = Math.min(daysToExpiration, Math.floor(investmentAmount / dailyCost));
    const hedgeEfficiencyScore = (hedgeCoverageReturn / totalCost) * (durationInDays / minimumDuration);

    // Calculate Greeks (these are simplified approximations)
    const delta = optionType === 'P' ? -cumulativeNormalDistribution(-d1(S, K, T, r, sigma)) : cumulativeNormalDistribution(d1(S, K, T, r, sigma));
    const gamma = Math.exp(-Math.pow(d1(S, K, T, r, sigma), 2) / 2) / (S * sigma * Math.sqrt(2 * Math.PI * T));
    const vega = S * Math.sqrt(T) * Math.exp(-Math.pow(d1(S, K, T, r, sigma), 2) / 2) / Math.sqrt(2 * Math.PI) / 100;
    const theta = optionType === 'P'
      ? (-S * sigma * Math.exp(-Math.pow(d1(S, K, T, r, sigma), 2) / 2) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * cumulativeNormalDistribution(-d2(S, K, T, r, sigma))) / 365
      : (-S * sigma * Math.exp(-Math.pow(d1(S, K, T, r, sigma), 2) / 2) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * cumulativeNormalDistribution(d2(S, K, T, r, sigma))) / 365;

    return {
      expiryDate: {
        display: `${expiryDate.toLocaleString('default', { month: 'short' })} ${expiryDate.getDate()} ${expiryDate.getFullYear()}`,
        raw: expiryDate.getTime()
      },
      strike: { display: `$${K.toFixed(2)}`, raw: K },
      markPrice: { display: optionPrice.toFixed(3), raw: optionPrice },
      bidPrice: { display: option.latestQuote.bp.toFixed(3), raw: option.latestQuote.bp },
      askPrice: { display: option.latestQuote.ap.toFixed(3), raw: option.latestQuote.ap },
      contractCost: { display: `$${contractCost.toFixed(2)}`, raw: contractCost },
      contracts: { display: contracts.toString(), raw: contracts },
      totalCost: { display: `$${totalCost.toFixed(2)}`, raw: totalCost },
      daysToExpiration: { display: daysToExpiration.toString(), raw: daysToExpiration },
      impliedVolatility: { display: `${(sigma * 100).toFixed(2)}%`, raw: sigma * 100 },
      delta: { display: delta.toFixed(4), raw: delta },
      gamma: { display: gamma.toFixed(6), raw: gamma },
      vega: { display: vega.toFixed(4), raw: vega },
      theta: { display: theta.toFixed(4), raw: theta },
      theoreticalPrice: { display: `$${theoreticalPrice.toFixed(2)}`, raw: theoreticalPrice },
      optionPrice: { display: optionPrice.toFixed(2), raw: optionPrice },
      theoreticalPriceAtTarget: { display: `$${theoreticalPriceAtTargetValue.toFixed(2)}`, raw: theoreticalPriceAtTargetValue },
      hedgeCoverageReturn: { display: `$${hedgeCoverageReturn.toFixed(2)}`, raw: hedgeCoverageReturn },
      hedgeEfficiencyScore: { display: hedgeEfficiencyScore.toFixed(4), raw: hedgeEfficiencyScore },
    };
  };

  // Helper functions for Black-Scholes calculations
  const d1 = (S: number, K: number, T: number, r: number, sigma: number): number =>
    (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));

  const d2 = (S: number, K: number, T: number, r: number, sigma: number): number =>
    d1(S, K, T, r, sigma) - sigma * Math.sqrt(T);

  // In your component:
  const sortedData = Object.entries(optionsData)
    .filter(([key, option]) => key.includes('P') && Math.max(0, Math.ceil((new Date(parseInt(key.slice(4, 6)) + 2000, parseInt(key.slice(6, 8)) - 1, parseInt(key.slice(8, 10))).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) > 7) // Filter for put options
    .map(([key, option]) => calculateMetrics(key, option, underlyingPrice, investmentAmount, targetPrice, ivIncrease))
    .sort((a, b) => {
      const aValue = a[sortColumn].raw;
      const bValue = b[sortColumn].raw;

      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1;
      if (bValue === null) return -1;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }

      // if (typeof aValue === 'string' && typeof bValue === 'string') {
      //   return sortDirection === 'asc'
      //     ? aValue.localeCompare(bValue)
      //     : bValue.localeCompare(aValue);
      // }

      return 0;
    });

  const chartData = sortedData.map(option => ({
    x: option.daysToExpiration.raw,
    y: option.hedgeEfficiencyScore.raw,
    z: option.totalCost.raw,
    name: `${option.expiryDate.display} - $${option.strike.raw}`,
  }));

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
              Stock Options <span className="text-blue-600 dark:text-blue-400">Analysis Dashboard</span>
            </h2>
          </motion.div>
          <Breadcrumbs items={[
            { label: 'Stocks', href: '/stocks' },
          ]} />

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">Current {ticker} Price</h3>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">${underlyingPrice.toLocaleString()}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">Ticker</h3>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
              />
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
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">Target Price ({TARGET_PRICE * 100}%)</h3>
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
                {sortedData.map((option, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-700'}>
                    {columns.map(({ key }) => (
                      <td key={key} className="px-4 py-2 text-gray-800 dark:text-gray-200">{option[key].display}</td>
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

export default StockOptionsDashboard;
