"use client"

import React, { useState, useEffect } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Breadcrumbs from '../components/Breadcrumbs';

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

const calculateMetrics = (
  option: StockOptionData,
  underlyingPrice: number,
  investmentAmount: number,
  targetPrice: number,
  ivIncrease: number
): CalculatedMetrics => {
  const expiryDate = new Date(option.expiration_date);
  const now = new Date();
  const daysToExpiration = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  const T = daysToExpiration / 365;
  const r = 0.01; // risk-free rate (assumed)
  const S = underlyingPrice;
  const K = option.strike_price;
  const sigma = option.impliedVolatility;

  const increasedSigma = sigma * (1 + ivIncrease / 100);

  // Black-Scholes calculations
  const d1 = (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const theoreticalPrice = option.option_type === 'put'
    ? blackScholesPut(S, K, T, r, sigma)
    : blackScholesCall(S, K, T, r, sigma);
  const theoreticalPriceAtTargetValue = option.option_type === 'put'
    ? blackScholesPut(targetPrice, K, T / 2, r, increasedSigma)
    : blackScholesCall(targetPrice, K, T / 2, r, increasedSigma);

  const optionPrice = (option.bid + option.ask) / 2;
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

  return {
    expiryDate: { display: expiryDate.toISOString().split('T')[0], raw: expiryDate.getTime() },
    strike: { display: `$${K.toFixed(2)}`, raw: K },
    markPrice: { display: optionPrice.toFixed(2), raw: optionPrice },
    bidPrice: { display: option.bid.toFixed(2), raw: option.bid },
    askPrice: { display: option.ask.toFixed(2), raw: option.ask },
    contractCost: { display: `$${contractCost.toFixed(2)}`, raw: contractCost },
    contracts: { display: contracts.toString(), raw: contracts },
    totalCost: { display: `$${totalCost.toFixed(2)}`, raw: totalCost },
    daysToExpiration: { display: daysToExpiration.toString(), raw: daysToExpiration },
    impliedVolatility: { display: `${(sigma * 100).toFixed(2)}%`, raw: sigma * 100 },
    delta: { display: option.greeks.delta.toFixed(4), raw: option.greeks.delta },
    gamma: { display: option.greeks.gamma.toFixed(6), raw: option.greeks.gamma },
    vega: { display: option.greeks.vega.toFixed(4), raw: option.greeks.vega },
    theta: { display: option.greeks.theta.toFixed(4), raw: option.greeks.theta },
    theoreticalPrice: { display: `$${theoreticalPrice.toFixed(2)}`, raw: theoreticalPrice },
    optionPrice: { display: optionPrice.toFixed(2), raw: optionPrice },
    theoreticalPriceAtTarget: { display: `$${theoreticalPriceAtTargetValue.toFixed(2)}`, raw: theoreticalPriceAtTargetValue },
    hedgeCoverageReturn: { display: `$${hedgeCoverageReturn.toFixed(2)}`, raw: hedgeCoverageReturn },
    hedgeEfficiencyScore: { display: hedgeEfficiencyScore.toFixed(4), raw: hedgeEfficiencyScore },
  };
};

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

const blackScholesCall = (S: number, K: number, T: number, r: number, sigma: number): number => {
  const d1 = (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return S * cumulativeNormalDistribution(d1) - K * Math.exp(-r * T) * cumulativeNormalDistribution(d2);
};

const StockOptionsDashboard: React.FC = () => {
  const [optionsData, setOptionsData] = useState<StockOptionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof CalculatedMetrics>('hedgeEfficiencyScore');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [underlyingPrice, setUnderlyingPrice] = useState(0);
  const [investmentAmount, setInvestmentAmount] = useState(10000);
  const [targetPrice, setTargetPrice] = useState(0);
  const [ivIncrease, setIvIncrease] = useState(0);
  const [ticker, setTicker] = useState('BITO');

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
        setTargetPrice(currentPrice * 0.8);

        // Fetch options data
        const optionsResponse = await fetch(`https://data.alpaca.markets/v1beta1/options/snapshots/${ticker}?feed=indicative&limit=100`, {
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
    option: ApiOptionData,
    underlyingPrice: number,
    investmentAmount: number,
    targetPrice: number,
    ivIncrease: number
  ): CalculatedMetrics => {
    const symbol = optionKey.slice(0, 4); // Extracting the symbol
    const expiryDatePart = optionKey.slice(4, 10); // Extracting the expiry date part
    const expiryYear = `20${expiryDatePart.slice(0, 2)}`;
    const expiryMonth = expiryDatePart.slice(2, 4);
    const expiryDay = expiryDatePart.slice(4, 6);
    const expiryDate = `${expiryYear}-${expiryMonth}-${expiryDay}`;

    const strikeAndType = optionKey.slice(10); // Extracting the strike and option type part
    const optionType = strikeAndType.slice(0, 1); // Extracting the option type
    const strike = parseFloat(strikeAndType.slice(1)); // Extracting the strike price

    const now = new Date();
    const expiry = new Date(`${expiryYear}-${expiryMonth}-${expiryDay}`);
    const daysToExpiration = Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

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
      expiryDate: { display: `${expiryMonth} ${expiryDay} ${expiryYear}`, raw: expiry.getTime() },
      strike: { display: `$${K.toFixed(2)}`, raw: K },
      markPrice: { display: optionPrice.toFixed(2), raw: optionPrice },
      bidPrice: { display: option.latestQuote.bp.toFixed(2), raw: option.latestQuote.bp },
      askPrice: { display: option.latestQuote.ap.toFixed(2), raw: option.latestQuote.ap },
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

  const blackScholesCall = (S: number, K: number, T: number, r: number, sigma: number): number => {
    const d1 = (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return S * cumulativeNormalDistribution(d1) - K * Math.exp(-r * T) * cumulativeNormalDistribution(d2);
  };

  // In your component:
  const sortedData = Object.entries(optionsData)
    // .filter(([key]) => key.endsWith('P')) // Filter for put options
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

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return 0;
    });

  if (loading) return <div className="text-center py-10">Loading...</div>;
  if (error) return <div className="text-center py-10 text-red-500">Error: {error}</div>;

  const chartData = sortedData.map(option => ({
    x: option.daysToExpiration.raw,
    y: option.hedgeEfficiencyScore.raw,
    z: option.totalCost.raw,
    name: `${option.expiryDate.display} - $${option.strike.raw}`,
  }));

  return (
    <div className="container mx-auto p-4 bg-gray-100 text-black min-h-screen">
      <Breadcrumbs items={[
        { label: 'Stocks', href: '/stocks' },
      ]} />
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Stock Options Analysis Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Ticker</h3>
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            className="w-full p-2 border rounded"
          />
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Current {ticker} Price</h3>
          <p className="text-2xl font-bold">${underlyingPrice.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Investment Amount</h3>
          <input
            type="number"
            value={investmentAmount}
            onChange={(e) => setInvestmentAmount(Number(e.target.value))}
            className="w-full p-2 border rounded"
          />
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Target Price</h3>
          <input
            type="number"
            value={targetPrice}
            onChange={(e) => setTargetPrice(Number(e.target.value))}
            className="w-full p-2 border rounded"
          />
        </div>
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">IV Increase (%)</h3>
          <input
            type="number"
            value={ivIncrease}
            onChange={(e) => setIvIncrease(Number(e.target.value))}
            className="w-full p-2 border rounded"
          />
        </div>
      </div>

      <div className="mb-8 bg-white p-4 rounded shadow">
        <h3 className="text-xl font-bold mb-2">Hedge Efficiency Score Visualization</h3>
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <XAxis type="number" dataKey="x" name="Days to Expiration" unit=" days" />
            <YAxis type="number" dataKey="y" name="Hedge Efficiency Score" unit="" />
            <ZAxis type="number" dataKey="z" range={[50, 1000]} name="Total Cost" unit="$" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={chartData} fill="#8884d8" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full">
          <thead>
            <tr className="bg-gray-200">
              {columns.map(({ key, label }) => (
                <th
                  key={key}
                  className="px-4 py-2 text-left cursor-pointer hover:bg-gray-300"
                  onClick={() => handleSort(key)}
                >
                  {label} <ArrowUpDown className="inline" size={16} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.map((option, index) => (
              <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                {columns.map(({ key }) => (
                  <td key={key} className="px-4 py-2">{option[key].display}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StockOptionsDashboard;
