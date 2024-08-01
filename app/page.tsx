"use client"

import React, { useState, useEffect } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer } from 'recharts';

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
  { key: 'optionPrice', label: 'MidPoint Opt Price' },
  { key: 'contractCost', label: 'Contract Cost' },
  { key: 'contracts', label: 'Contracts' },
  { key: 'totalCost', label: 'Total Cost' },
  { key: 'theoreticalPrice', label: 'Theoretical Price' },
  { key: 'theoreticalPriceAtTarget', label: 'Theoretical Price at Target' },
  { key: 'hedgeCoverageReturn', label: 'Hedge Coverage Return' },
  { key: 'daysToExpiration', label: 'Days to Expiry' },
  // Greeks
  { key: 'impliedVolatility', label: 'IV' },
  { key: 'delta', label: 'Delta' },
  { key: 'gamma', label: 'Gamma' },
  { key: 'vega', label: 'Vega' },
  { key: 'theta', label: 'Theta' },

  { key: 'hedgeEfficiency', label: 'Hedge Efficiency' },
  { key: 'hedgeEfficiencyPerDay', label: 'Hedge Efficiency Per Day' },
  { key: 'hedgeEfficiencyScore', label: 'Hedge Efficiency Score' },
];

const OptionsDashboard: React.FC = () => {
  const [optionsData, setOptionsData] = useState<OptionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof CalculatedMetrics>('hedgeCoverageReturn');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [btcPrice, setBtcPrice] = useState(0);
  const [investmentAmount, setInvestmentAmount] = useState(4000);
  const [targetPrice, setTargetPrice] = useState(0);
  const [ivIncrease, setIvIncrease] = useState(200); // 20% IV increase by default

  useEffect(() => {
    const fetchDeribitData = async () => {
      try {
        const response = await fetch('https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option');
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
        const response = await fetch('https://api.bybit.com/v5/market/tickers?category=option&baseCoin=BTC');
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
              mark_price: parseFloat(option.markPrice) / parseFloat(option.underlyingPrice), // Convert to BTC
              bid_price: parseFloat(option.bid1Price) / parseFloat(option.underlyingPrice), // Convert to BTC
              ask_price: parseFloat(option.ask1Price) / parseFloat(option.underlyingPrice), // Convert to BTC
              // mark_iv: parseFloat(option.markIv),
              mark_iv: parseFloat(option.markIv) * 100,
              underlying_index: 'BTC',
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
          setBtcPrice(allOptions[0].underlying_price);
          setTargetPrice(allOptions[0].underlying_price * 0.4);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, []);

  const calculateMetrics = (option: OptionData): CalculatedMetrics | null => {
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
      exchange: option.exchange,
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

  // const consistentUnderlyingPrice = optionsData[0]?.underlying_price || 0;
  const sortedData = [...optionsData]
    // .filter(o => o.ask_price && o.bid_price && getOptionDaysToExpiry(o) > 15 && o.instrument_name.includes('-P'))
    .filter(o => {
      const isValid = o.ask_price && o.bid_price && getOptionDaysToExpiry(o) > 50;
      if (!isValid) {
        console.log('Filtered out option:', o,  getOptionDaysToExpiry(o));  // Log filtered out options
      }
      return isValid;
    })
    .map(o => calculateMetrics(o))
    .filter(Boolean)
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

  const handleSort = (column: keyof CalculatedMetrics) => {
    setSortColumn(column);
    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  if (loading) return <div className="text-center py-10">Loading...</div>;
  if (error) return <div className="text-center py-10 text-red-500">Error: {error}</div>;

  const chartData = sortedData.map(option => ({
    x: option.daysToExpiration.raw,
    // y: option.hedgeEfficiency.raw,
    y: option.hedgeEfficiencyScore.raw, 
    z: option.totalCost.raw,
    name: `${option.expiryDate.display} - $${option.strike.raw}`,
  }));

  return (
    <div className="container mx-auto p-4 bg-gray-100 text-black min-h-screen">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Put Options Analysis Dashboard</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-bold mb-2">Current BTC Price</h3>
          <p className="text-2xl font-bold">${btcPrice.toLocaleString()}</p>
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

      {/* <div className="mb-8 bg-white p-4 rounded shadow">
        <h3 className="text-xl font-bold mb-2">Hedge Efficiency Visualization</h3>
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <XAxis type="number" dataKey="x" name="Days to Expiration" unit=" days" />
            <YAxis type="number" dataKey="y" name="Hedge Efficiency" unit="x" />
            <ZAxis type="number" dataKey="z" range={[50, 1000]} name="Total Cost" unit="$" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={chartData} fill="#8884d8" />
          </ScatterChart>
        </ResponsiveContainer>
      </div> */}
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
              <th className="px-4 py-2 text-left cursor-pointer hover:bg-gray-300">Exchange</th>
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
                <td className="px-4 py-2">{option.exchange}</td>
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

export default function Home() {
  return <OptionsDashboard />;
}