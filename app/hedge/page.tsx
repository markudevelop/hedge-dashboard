"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ArrowUpDown, Menu, X, Moon, Sun } from "lucide-react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { create, all, Complex } from "mathjs";
const math = create(all);

import NavLink from "../components/NavLink";
import Breadcrumbs from "../components/Breadcrumbs";
import useDarkMode from "../hooks/useDarkMode";

// =============================
//         Heston Model
// =============================

const hestonOptionPrice = (
  S: number,
  K: number,
  T: number,
  r: number,
  q: number,
  params: {
    v0: number;
    theta: number;
    kappa: number;
    sigma: number;
    rho: number;
  },
  optionType: "put" | "call" = "put"
): number => {
  const { v0, theta, kappa, sigma, rho } = params;
  const lambda = 0; // often set to 0

  const P1 = hestonProbability(S, K, T, r, q, v0, theta, kappa, sigma, rho, lambda, 1);
  const P2 = hestonProbability(S, K, T, r, q, v0, theta, kappa, sigma, rho, lambda, 2);

  if (optionType === "call") {
    return S * Math.exp(-q * T) * P1 - K * Math.exp(-r * T) * P2;
  } else {
    return K * Math.exp(-r * T) * (1 - P2) - S * Math.exp(-q * T) * (1 - P1);
  }
};

const hestonProbability = (
  S: number,
  K: number,
  T: number,
  r: number,
  q: number,
  v0: number,
  theta: number,
  kappa: number,
  sigma: number,
  rho: number,
  lambda: number,
  Pnum: number
): number => {
  const i = math.complex(0, 1);

  // Ensure K is a number
  const kNum = typeof K === "number" ? K : parseFloat(String(K));

  const integrand = (phi: number): number => {
    // exponent = e^(-i*phi * ln(K))
    const exponent = math.multiply(
      math.multiply(math.complex(-phi, 0), i),
      math.log(kNum)
    ) as Complex;
    const expTerm = math.exp(exponent) as Complex;

    // Characteristic function => Complex
    const charFuncVal = hestonCharacteristicFunction(
      phi,
      S,
      T,
      r,
      q,
      v0,
      theta,
      kappa,
      sigma,
      rho,
      lambda,
      Pnum
    ) as Complex;

    // numerator = e^(...) * CF
    const numerator = math.multiply(expTerm, charFuncVal) as Complex;
    const denominator = math.multiply(i, phi) as Complex;
    const value = math.divide(numerator, denominator) as Complex;

    // integrand is real part
    return value.re;
  };

  // Simple numerical integration
  const upperLimit = 100;
  const N = 1000;
  const delta = upperLimit / N;

  let sum = 0;
  for (let j = 1; j <= N; j++) {
    const phi = delta * (j - 0.5);
    sum += integrand(phi) * delta;
  }

  return 0.5 + (1 / Math.PI) * sum;
};

const hestonCharacteristicFunction = (
  phi: number,
  S: number,
  T: number,
  r: number,
  q: number,
  v0: number,
  theta: number,
  kappa: number,
  sigma: number,
  rho: number,
  lambda: number,
  Pnum: number
): Complex => {
  const i = math.complex(0, 1);

  // For Pnum=1 => u=0.5, else => u=-0.5
  const u = Pnum === 1 ? 0.5 : -0.5;

  // b = kappa - lambda + rho*sigma
  const b = kappa - lambda + rho * sigma;
  // a = kappa * theta
  const a = kappa * theta;
  // x = ln(S)
  const x = math.log(S);

  // Convert everything to Complex so TS knows we do complex math
  const bC = math.complex(b, 0);
  const sigmaC = math.complex(sigma, 0);
  const iPhi = math.multiply(i, phi) as Complex;

  // subTerm = (bC - rho*sigma * iPhi)
  const rhoSigma = math.complex(rho * sigma, 0);
  const subTerm = math.subtract(bC, math.multiply(rhoSigma, iPhi) as Complex) as Complex;

  // subTerm^2
  const subTerm2 = math.pow(subTerm, 2) as Complex;

  // iPhi^2 + -2*u*iPhi
  const iPhi2 = math.multiply(iPhi, iPhi) as Complex;
  const minus2u = math.multiply(-2 * u, iPhi) as Complex;
  const bracket = math.add(iPhi2, minus2u) as Complex;

  // sigma^2 * bracket
  const sigmaSq = math.pow(sigmaC, 2) as Complex;
  const secondTerm = math.multiply(sigmaSq, bracket) as Complex;

  // sum => subTerm^2 + secondTerm
  const sum = math.add(subTerm2, secondTerm) as Complex;

  // d = sqrt(...)
  const d = math.sqrt(sum) as Complex;

  // g = (b - rho*sigma*iPhi - d) / (b - rho*sigma*iPhi + d)
  const top = math.subtract(subTerm, d) as Complex;
  const bottom = math.add(subTerm, d) as Complex;
  const g = math.divide(top, bottom) as Complex;

  // exponent1 = (b - rho*sigma*iPhi - d) * T
  const exponent1 = math.multiply(top, T) as Complex;
  // exponent2 = d * T
  const exponent2 = math.multiply(d, T) as Complex;

  // -----------
  // C Calculation
  // -----------
  // log( [1 - g*exp(-exponent2)] / [1 - g] )
  const oneMinusG = math.subtract(1, g) as Complex;
  const gExp = math.multiply(g, math.exp(math.unaryMinus(exponent2) as Complex) as Complex) as Complex;
  const topInside = math.subtract(1, gExp) as Complex;
  const fracInside = math.divide(topInside, oneMinusG) as Complex;

  //   math.log(...) => Complex
  const logFrac = math.log(fracInside.re > 0 ? fracInside.re : fracInside) as Complex;
  // note: If fracInside is negative real, math.log(negativeNumber) yields complex

  // a / sigma^2
  const aOverSig2 = math.divide(math.complex(a, 0), math.pow(sigmaC, 2) as Complex) as Complex;
  // exponent1 / sigma^2
  const exponent1OverSig2 = math.divide(exponent1, math.pow(sigmaC, 2) as Complex) as Complex;

  // The big bracket => a/sigma^2 + [log(fracInside) - exponent1/sigma^2]
  const bracketC = math.add(
    aOverSig2,
    math.subtract(logFrac, exponent1OverSig2) as Complex
  ) as Complex;

  // C = r*i*phi*T * bracketC
  const rC = math.complex(r, 0);
  const iPhiT = math.multiply(math.multiply(rC, iPhi) as Complex, T) as Complex;
  const C = math.multiply(iPhiT, bracketC) as Complex;

  // -----------
  // D Calculation
  // -----------
  // [ (b - rho*sigma*iPhi - d) / sigma^2 ] * [ (1 - exp(-exponent2)) / (1 - g*exp(-exponent2)) ]
  const numeratorD1 = math.divide(subTerm, math.pow(sigmaC, 2) as Complex) as Complex;
  const eNegExp2 = math.exp(math.unaryMinus(exponent2) as Complex) as Complex;
  const oneMinusExpNeg2 = math.subtract(1, eNegExp2) as Complex;
  const bottom2 = math.subtract(1, math.multiply(g, eNegExp2) as Complex) as Complex;
  const fraction2 = math.divide(oneMinusExpNeg2, bottom2) as Complex;
  const D = math.multiply(numeratorD1, fraction2) as Complex;

  // characteristic = exp( C + D*v0 + i*phi*x )
  const v0C = math.complex(v0, 0);
  const iPhiX = math.multiply(iPhi, x) as Complex;

  const sumExp = math.add(
    math.add(C, math.multiply(D, v0C) as Complex) as Complex,
    iPhiX
  ) as Complex;

  const characteristic = math.exp(sumExp) as Complex;
  return characteristic;
};

// =============================
//         Types
// =============================

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
  exchange: "Deribit" | "Bybit";
};

type MetricValue = {
  display: string;
  raw: number | number[] | string | null;
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
  hedgeEfficiency: MetricValue;
  hedgeEfficiencyPerDay: MetricValue;
  exchange: MetricValue;
  longStrike?: MetricValue;
  shortStrike?: MetricValue;
  spreadWidth?: MetricValue;
  maxProfit?: MetricValue;
  maxLoss?: MetricValue;
  breakEvenPrice?: MetricValue;
  lowerBreakEven?: MetricValue;
  upperBreakEven?: MetricValue;
  vegaEfficiency: MetricValue;
  hestonPrice: MetricValue;
  hestonPriceAtTarget: MetricValue;
};

type Column = {
  key: keyof CalculatedMetrics;
  label: string;
};

type OptionType = "put" | "spread" | "butterfly" | "ratioBackspread";

const TARGET_PRICE = 0.7;

const columns: Column[] = [
  { key: "expiryDate", label: "Expiry" },
  { key: "strike", label: "Strike" },
  { key: "markPrice", label: "Mark Price" },
  { key: "bidPrice", label: "Bid Price" },
  { key: "askPrice", label: "Ask Price" },
  { key: "optionPrice", label: "MidPoint Opt Price" },
  { key: "contractCost", label: "Contract Cost" },
  { key: "theoreticalPrice", label: "Theoretical Price" },
  { key: "contracts", label: "Contracts" },
  { key: "totalCost", label: "Total Cost" },
  { key: "theoreticalPriceAtTarget", label: "Theoretical Price at Target" },
  { key: "hedgeCoverageReturn", label: "Hedge Coverage Return" },
  { key: "daysToExpiration", label: "Days to Expiry" },
  { key: "impliedVolatility", label: "IV" },
  { key: "delta", label: "Delta" },
  { key: "gamma", label: "Gamma" },
  { key: "vega", label: "Vega" },
  { key: "theta", label: "Theta" },
  { key: "hedgeEfficiency", label: "Hedge Efficiency" },
  { key: "hedgeEfficiencyPerDay", label: "Hedge Efficiency Per Day" },
  { key: "hedgeEfficiencyScore", label: "Hedge Efficiency Score" },
  { key: "vegaEfficiency", label: "Vega Efficiency" },
  { key: "longStrike", label: "Long Strike" },
  { key: "shortStrike", label: "Short Strike" },
  { key: "spreadWidth", label: "Spread Width" },
  { key: "maxProfit", label: "Max Profit" },
  { key: "maxLoss", label: "Max Loss" },
  { key: "breakEvenPrice", label: "Break Even Price" },
  { key: "lowerBreakEven", label: "Lower Break Even" },
  { key: "upperBreakEven", label: "Upper Break Even" },
  { key: "hestonPrice", label: "Heston Model Price" },
  { key: "hestonPriceAtTarget", label: "Heston Price at Target" },
];

// =============================
//       Main Component
// =============================

const OptionsDashboard: React.FC = () => {
  const [currency, setCurrency] = useState("BTC");
  const [optionType, setOptionType] = useState<OptionType>("put");
  const [optionsData, setOptionsData] = useState<OptionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<keyof CalculatedMetrics>(
    "hedgeEfficiencyPerDay"
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [btcPrice, setBtcPrice] = useState(0);
  const [investmentAmount, setInvestmentAmount] = useState(1000);
  const [targetPrice, setTargetPrice] = useState(0);
  const [ivIncrease, setIvIncrease] = useState(150);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [ratioBackspreadRatio, setRatioBackspreadRatio] = useState(2);

  const { isDarkMode, toggleDarkMode } = useDarkMode();

  // ============================
  //       Data Fetching
  // ============================
  useEffect(() => {
    const fetchDeribitData = async () => {
      try {
        const response = await fetch(
          `https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=${currency}&kind=option`
        );
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        const data = await response.json();
        if (data.result) {
          const putOptions = data.result
            .filter((option: OptionData) => option.instrument_name.includes("-P"))
            .map((option: OptionData) => ({
              ...option,
              exchange: "Deribit" as const,
            }));
          return putOptions;
        } else {
          throw new Error("Failed to fetch Deribit options data");
        }
      } catch (err) {
        console.error("Error fetching Deribit data:", err);
        return [];
      }
    };

    const fetchBybitData = async () => {
      try {
        const response = await fetch(
          `https://api.bybit.com/v5/market/tickers?category=option&baseCoin=${currency}`
        );
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        const data = await response.json();
        if (data.result && data.result.list) {
          const putOptions = data.result.list
            .filter((option: any) => option.symbol.includes("-P"))
            .map((option: any) => ({
              instrument_name: option.symbol,
              underlying_price: parseFloat(option.underlyingPrice),
              mark_price:
                parseFloat(option.markPrice) / parseFloat(option.underlyingPrice),
              bid_price:
                parseFloat(option.bid1Price) / parseFloat(option.underlyingPrice),
              ask_price:
                parseFloat(option.ask1Price) / parseFloat(option.underlyingPrice),
              mark_iv: parseFloat(option.markIv) * 100,
              underlying_index: currency,
              creation_timestamp: Date.now(),
              open_interest: parseFloat(option.openInterest),
              exchange: "Bybit" as const,
            }));
          return putOptions;
        } else {
          throw new Error("Failed to fetch Bybit options data");
        }
      } catch (err) {
        console.error("Error fetching Bybit data:", err);
        return [];
      }
    };

    const fetchAllData = async () => {
      setLoading(true);
      try {
        const [deribitOptions, bybitOptions] = await Promise.all([
          fetchDeribitData(),
          fetchBybitData(),
        ]);
        const allOptions = [...deribitOptions, ...bybitOptions];
        setOptionsData(allOptions);

        if (allOptions.length > 0 && bybitOptions.length > 0) {
          setBtcPrice(bybitOptions[0].underlying_price);
          setTargetPrice(bybitOptions[0].underlying_price * TARGET_PRICE);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [currency]);

  // ============================
  //   Black-Scholes + Helpers
  // ============================
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
    const erf =
      1 -
      (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z));
    return 0.5 * (1 + sign * erf);
  };

  const blackScholesPut = (
    S: number,
    K: number,
    T: number,
    r: number,
    sigma: number
  ): number => {
    const d1 =
      (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) /
      (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return (
      K * Math.exp(-r * T) * cumulativeNormalDistribution(-d2) -
      S * cumulativeNormalDistribution(-d1)
    );
  };

  const calculateDelta = (
    S: number,
    K: number,
    T: number,
    r: number,
    sigma: number,
    optionType: "call" | "put"
  ): number => {
    const d1 =
      (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) /
      (sigma * Math.sqrt(T));
    return optionType === "call"
      ? cumulativeNormalDistribution(d1)
      : cumulativeNormalDistribution(d1) - 1;
  };

  const calculateGamma = (
    S: number,
    K: number,
    T: number,
    r: number,
    sigma: number
  ): number => {
    const d1 =
      (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) /
      (sigma * Math.sqrt(T));
    return (
      Math.exp(-Math.pow(d1, 2) / 2) /
      (S * sigma * Math.sqrt(2 * Math.PI * T))
    );
  };

  const calculateVega = (
    S: number,
    K: number,
    T: number,
    r: number,
    sigma: number
  ): number => {
    const d1 =
      (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) /
      (sigma * Math.sqrt(T));
    return (
      S *
      Math.sqrt(T) *
      Math.exp(-Math.pow(d1, 2) / 2) /
      Math.sqrt(2 * Math.PI)
    );
  };

  const calculateTheta = (
    S: number,
    K: number,
    T: number,
    r: number,
    sigma: number,
    optionType: "call" | "put"
  ): number => {
    const d1 =
      (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) /
      (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    const term1 =
      (-S * sigma * Math.exp(-Math.pow(d1, 2) / 2)) / (2 * Math.sqrt(T));
    const term2 = r * K * Math.exp(-r * T);
    if (optionType === "call") {
      return (term1 - term2 * cumulativeNormalDistribution(d2)) / 365;
    } else {
      return (term1 + term2 * cumulativeNormalDistribution(-d2)) / 365;
    }
  };

  // ============================
  //   Single Put Calculation
  // ============================

  const calculateMetrics = useMemo(
    () => (option: OptionData): CalculatedMetrics | null => {
      const [, expiryDate, strikeStr] = option.instrument_name.split("-");
      const strike = parseFloat(strikeStr);

      if (option.ask_price < 0.0001 || option.bid_price < 0.0001) {
        return null;
      }

      const expiryTimestamp = new Date(expiryDate).getTime();
      const now = Date.now();
      const daysToExpiration = Math.max(
        0,
        Math.ceil((expiryTimestamp - now) / (1000 * 60 * 60 * 24))
      );

      const T = daysToExpiration / 365;
      const r = 0.01;
      const S = option.underlying_price;
      const K = strike;
      const sigma = option.mark_iv / 100;

      const increasedSigma = sigma * (1 + ivIncrease / 100);

      // Black-Scholes
      const d1 =
        (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) /
        (sigma * Math.sqrt(T));
      const d2 = d1 - sigma * Math.sqrt(T);
      const nd1 = cumulativeNormalDistribution(-d1);
      const nd2 = cumulativeNormalDistribution(-d2);

      const theoreticalPrice = blackScholesPut(S, K, T, r, sigma);
      const theoreticalPriceAtTargetValue = blackScholesPut(
        targetPrice,
        K,
        T / 2,
        r,
        increasedSigma
      );

      const delta = nd1 - 1;
      const gamma =
        Math.exp(-Math.pow(d1, 2) / 2) /
        (S * sigma * Math.sqrt(2 * Math.PI * T));
      const vega =
        (S *
          Math.sqrt(T) *
          Math.exp(-Math.pow(d1, 2) / 2)) /
        Math.sqrt(2 * Math.PI) /
        100;
      const theta =
        (-S * sigma * Math.exp(-Math.pow(d1, 2) / 2)) / (2 * Math.sqrt(T)) / 365 +
        ((r * K * Math.exp(-r * T) * nd2) / 365);

      // Midpoint
      const optionPrice = (option.ask_price + option.bid_price) / 2;

      const contractCost = optionPrice * S;
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
      const durationInDays = Math.min(
        daysToExpiration,
        Math.floor(investmentAmount / dailyCost)
      );
      const hedgeEfficiencyScore =
        (hedgeCoverageReturn / totalCost) * (durationInDays / minimumDuration);
      const totalVega = vega * contracts;
      const vegaEfficiency = totalVega / totalCost;

      // Heston
      const hestonParams = {
        v0: sigma ** 2,
        theta: sigma ** 2,
        kappa: 2.0,
        sigma: 0.2,
        rho: -0.7,
      };
      const hestonPrice = hestonOptionPrice(S, K, T, r, 0, hestonParams, "put");
      const hestonPriceAtTarget = hestonOptionPrice(
        targetPrice,
        K,
        T / 2,
        r,
        0,
        hestonParams,
        "put"
      );

      return {
        vegaEfficiency: { display: vegaEfficiency.toFixed(4), raw: vegaEfficiency },
        expiryDate: { display: expiryDate, raw: expiryTimestamp },
        strike: { display: `$${strike.toLocaleString()}`, raw: strike },
        optionPrice: { display: optionPrice.toFixed(4), raw: optionPrice },
        markPrice: {
          display: option.mark_price.toFixed(4),
          raw: option.mark_price,
        },
        bidPrice: {
          display: option.bid_price ? option.bid_price.toFixed(4) : "N/A",
          raw: option.bid_price ? option.bid_price * 100 : null,
        },
        askPrice: { display: option.ask_price.toFixed(4), raw: option.ask_price },
        contractCost: { display: `$${contractCost.toFixed(2)}`, raw: contractCost },
        contracts: { display: contracts.toFixed(2), raw: contracts },
        totalCost: { display: `$${totalCost.toFixed(2)}`, raw: totalCost },
        daysToExpiration: {
          display: daysToExpiration.toString(),
          raw: daysToExpiration,
        },
        impliedVolatility: {
          display: `${option.mark_iv.toFixed(2)}%`,
          raw: option.mark_iv,
        },
        delta: { display: delta.toFixed(4), raw: delta },
        gamma: { display: gamma.toFixed(6), raw: gamma },
        vega: { display: vega.toFixed(4), raw: vega },
        theta: { display: theta.toFixed(4), raw: theta },
        theoreticalPrice: {
          display: `$${theoreticalPrice.toFixed(4)}`,
          raw: theoreticalPrice,
        },
        theoreticalPriceAtTarget: {
          display: `$${theoreticalPriceAtTargetValue.toFixed(4)}`,
          raw: theoreticalPriceAtTargetValue,
        },
        hedgeCoverageReturn: {
          display: `$${hedgeCoverageReturn.toFixed(2)}`,
          raw: hedgeCoverageReturn,
        },
        hedgeEfficiency: { display: hedgeEfficiency.toFixed(2), raw: hedgeEfficiency },
        hedgeEfficiencyPerDay: {
          display: hedgeEfficiencyPerDay.toFixed(4),
          raw: hedgeEfficiencyPerDay,
        },
        exchange: { display: option.exchange, raw: option.exchange },
        hedgeEfficiencyScore: {
          display: hedgeEfficiencyScore.toFixed(4),
          raw: hedgeEfficiencyScore,
        },
        hestonPrice: {
          display: `$${hestonPrice.toFixed(4)}`,
          raw: hestonPrice,
        },
        hestonPriceAtTarget: {
          display: `$${hestonPriceAtTarget.toFixed(4)}`,
          raw: hestonPriceAtTarget,
        },
      };
    },
    [investmentAmount, targetPrice, ivIncrease]
  );

  // ============================
  //     Spread / Butterfly / etc.
  // ============================

  const isValidPrice = (price: number): boolean => {
    return typeof price === "number" && !isNaN(price) && price > 0;
  };

  const calculateSpreadMetrics = useMemo(
    () =>
      (longOption: OptionData, shortOption: OptionData): CalculatedMetrics | null => {
        const [, longExpiryDate] = longOption.instrument_name.split("-");
        const [, shortExpiryDate] = shortOption.instrument_name.split("-");
        if (longExpiryDate !== shortExpiryDate) {
          return null;
        }

        const longStrike = parseFloat(longOption.instrument_name.split("-")[2]);
        const shortStrike = parseFloat(shortOption.instrument_name.split("-")[2]);

        if (
          isNaN(shortStrike) ||
          isNaN(longStrike) ||
          shortStrike <= longStrike
        ) {
          return null;
        }

        // Check for valid prices
        if (
          !isValidPrice(longOption.bid_price) ||
          !isValidPrice(longOption.ask_price) ||
          !isValidPrice(shortOption.bid_price) ||
          !isValidPrice(shortOption.ask_price)
        ) {
          return null;
        }

        // Spread
        const spreadBid = Math.max(0, shortOption.bid_price - longOption.ask_price);
        const spreadAsk = shortOption.ask_price - longOption.bid_price;
        const netPremium = (spreadBid + spreadAsk) / 2;
        if (netPremium <= 0) {
          return null;
        }

        const spreadWidth = shortStrike - longStrike;
        const underlyingPrice =
          (longOption.underlying_price + shortOption.underlying_price) / 2;

        const contractCost = netPremium * underlyingPrice;
        const contracts = Math.floor(investmentAmount / contractCost);
        if (contracts <= 0) {
          return null;
        }

        const totalCost = contracts * contractCost;
        const expiryTimestamp = new Date(longExpiryDate).getTime();
        const now = Date.now();
        const daysToExpiration = Math.max(
          0,
          Math.ceil((expiryTimestamp - now) / (1000 * 60 * 60 * 24))
        );

        const T = daysToExpiration / 365;
        const r = 0.01;
        const S = underlyingPrice;
        const sigmaLong = longOption.mark_iv / 100;
        const sigmaShort = shortOption.mark_iv / 100;
        const increasedSigmaLong = sigmaLong * (1 + ivIncrease / 100);
        const increasedSigmaShort = sigmaShort * (1 + ivIncrease / 100);

        const theoreticalPrice =
          blackScholesPut(S, shortStrike, T, r, sigmaShort) -
          blackScholesPut(S, longStrike, T, r, sigmaLong);

        const longPutPriceAtTarget = blackScholesPut(
          targetPrice,
          longStrike,
          T / 2,
          r,
          increasedSigmaLong
        );
        const shortPutPriceAtTarget = blackScholesPut(
          targetPrice,
          shortStrike,
          T / 2,
          r,
          increasedSigmaShort
        );
        const theoreticalPriceAtTarget = shortPutPriceAtTarget - longPutPriceAtTarget;

        const longDelta = calculateDelta(S, longStrike, T, r, sigmaLong, "put");
        const shortDelta = calculateDelta(S, shortStrike, T, r, sigmaShort, "put");
        const spreadDelta = longDelta - shortDelta;

        const longGamma = calculateGamma(S, longStrike, T, r, sigmaLong);
        const shortGamma = calculateGamma(S, shortStrike, T, r, sigmaShort);
        const spreadGamma = longGamma - shortGamma;

        const longVega = calculateVega(S, longStrike, T, r, sigmaLong);
        const shortVega = calculateVega(S, shortStrike, T, r, sigmaShort);
        const spreadVega = longVega - shortVega;

        const longTheta = calculateTheta(S, longStrike, T, r, sigmaLong, "put");
        const shortTheta = calculateTheta(S, shortStrike, T, r, sigmaShort, "put");
        const spreadTheta = longTheta - shortTheta;

        const hedgeCoverageReturn = contracts * theoreticalPriceAtTarget;
        const hedgeEfficiency = hedgeCoverageReturn / totalCost;
        const hedgeEfficiencyPerDay = hedgeEfficiency / daysToExpiration;
        const minimumDuration = 30;
        const durationInDays = Math.min(daysToExpiration, minimumDuration);
        const hedgeEfficiencyScore =
          (hedgeCoverageReturn / totalCost) * (durationInDays / minimumDuration);

        const maxProfit = spreadWidth - netPremium;
        const maxLoss = netPremium;
        const breakEvenPrice = shortStrike - netPremium;

        return {
          expiryDate: { display: longExpiryDate, raw: expiryTimestamp },
          strike: {
            display: `$${shortStrike.toLocaleString()} - $${longStrike.toLocaleString()}`,
            raw: [shortStrike, longStrike],
          },
          markPrice: { display: netPremium.toFixed(4), raw: netPremium },
          bidPrice: { display: spreadBid.toFixed(4), raw: spreadBid },
          askPrice: { display: spreadAsk.toFixed(4), raw: spreadAsk },
          optionPrice: { display: netPremium.toFixed(4), raw: netPremium },
          contractCost: {
            display: `$${contractCost.toFixed(2)}`,
            raw: contractCost,
          },
          contracts: { display: contracts.toFixed(2), raw: contracts },
          totalCost: { display: `$${totalCost.toFixed(2)}`, raw: totalCost },
          theoreticalPrice: {
            display: `$${theoreticalPrice.toFixed(4)}`,
            raw: theoreticalPrice,
          },
          theoreticalPriceAtTarget: {
            display: `$${theoreticalPriceAtTarget.toFixed(4)}`,
            raw: theoreticalPriceAtTarget,
          },
          hedgeCoverageReturn: {
            display: `$${hedgeCoverageReturn.toFixed(2)}`,
            raw: hedgeCoverageReturn,
          },
          daysToExpiration: {
            display: daysToExpiration.toString(),
            raw: daysToExpiration,
          },
          impliedVolatility: {
            display: `${(
              (longOption.mark_iv + shortOption.mark_iv) /
              2
            ).toFixed(2)}%`,
            raw: (longOption.mark_iv + shortOption.mark_iv) / 2,
          },
          delta: { display: spreadDelta.toFixed(4), raw: spreadDelta },
          gamma: { display: spreadGamma.toFixed(6), raw: spreadGamma },
          vega: { display: spreadVega.toFixed(4), raw: spreadVega },
          theta: { display: spreadTheta.toFixed(4), raw: spreadTheta },
          hedgeEfficiency: { display: hedgeEfficiency.toFixed(2), raw: hedgeEfficiency },
          hedgeEfficiencyPerDay: {
            display: hedgeEfficiencyPerDay.toFixed(4),
            raw: hedgeEfficiencyPerDay,
          },
          hedgeEfficiencyScore: {
            display: hedgeEfficiencyScore.toFixed(4),
            raw: hedgeEfficiencyScore,
          },
          maxProfit: { display: `$${maxProfit.toFixed(2)}`, raw: maxProfit },
          maxLoss: { display: `$${maxLoss.toFixed(2)}`, raw: maxLoss },
          breakEvenPrice: {
            display: `$${breakEvenPrice.toFixed(2)}`,
            raw: breakEvenPrice,
          },
          exchange: { display: longOption.exchange, raw: longOption.exchange },
          longStrike: {
            display: `$${longStrike.toLocaleString()}`,
            raw: longStrike,
          },
          shortStrike: {
            display: `$${shortStrike.toLocaleString()}`,
            raw: shortStrike,
          },
          spreadWidth: {
            display: `$${spreadWidth.toFixed(2)}`,
            raw: spreadWidth,
          },
          vegaEfficiency: { display: "0", raw: 0 }, // or compute if needed
          hestonPrice: { display: "$0.0000", raw: 0 },
          hestonPriceAtTarget: { display: "$0.0000", raw: 0 },
        };
      },
    [investmentAmount, targetPrice, ivIncrease]
  );

  // (Similar approach for butterfly, ratioBackspread, etc.)

  // ============================
  //       Final Data
  // ============================

  const getOptionDaysToExpiry = (o: OptionData): number => {
    const [, expiryDateStr] = o.instrument_name.split("-");
    let expiryDate: Date;

    if (/^[0-9]{1,2}[A-Z]{3}[0-9]{2}$/.test(expiryDateStr)) {
      // e.g. 2AUG24 or 27SEP24
      const day = expiryDateStr.slice(0, expiryDateStr.length - 5);
      const month = expiryDateStr.slice(
        expiryDateStr.length - 5,
        expiryDateStr.length - 2
      );
      const year = expiryDateStr.slice(expiryDateStr.length - 2);
      expiryDate = new Date(`${day} ${month} 20${year}`);
    } else if (/^[0-9]{6}$/.test(expiryDateStr)) {
      // Bybit format: YYMMDD
      const year = expiryDateStr.slice(0, 2);
      const month = expiryDateStr.slice(2, 4);
      const day = expiryDateStr.slice(4, 6);
      expiryDate = new Date(`20${year}-${month}-${day}`);
    } else {
      console.error("Unexpected date format:", o.instrument_name);
      return 0;
    }

    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  const filterValidOptions = (options: OptionData[]): OptionData[] => {
    return options.filter((o) => {
      const isValid = o.ask_price && o.bid_price && getOptionDaysToExpiry(o) > 40;
      return isValid;
    });
  };

  // For brevity, only included Spread + single Put.
  // You also have butterfly & ratioBackspread below...

  const generateOptionsData = useMemo(() => {
    return (options: OptionData[]): CalculatedMetrics[] => {
      if (optionType === "put") {
        return options.map((option) => calculateMetrics(option)).filter(Boolean);
      } else if (optionType === "spread") {
        const spreads: CalculatedMetrics[] = [];
        // Group by expiry
        const optionsByExpiry = options.reduce((acc: any, option) => {
          const [, expiryDate] = option.instrument_name.split("-");
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
              const strike1 = parseFloat(option1.instrument_name.split("-")[2]);
              const strike2 = parseFloat(option2.instrument_name.split("-")[2]);

              if (strike1 > strike2) {
                // Long lower, short higher
                const spreadMetrics = calculateSpreadMetrics(option2, option1);
                if (spreadMetrics) spreads.push(spreadMetrics);
              }
            }
          }
        });
        return spreads;
      } else if (optionType === "butterfly") {
        // Implement your butterfly logic
        return [];
      } else if (optionType === "ratioBackspread") {
        // Implement your ratio-backspread logic
        return [];
      }
      return [];
    };
  }, [optionType, calculateMetrics, calculateSpreadMetrics]);

  const processOptionsData = useMemo(() => {
    const validOptions = filterValidOptions(optionsData);
    const generatedData = generateOptionsData(validOptions);

    return generatedData
      .filter(Boolean)
      .sort((a, b) => {
        const aValue = a[sortColumn].raw;
        const bValue = b[sortColumn].raw;

        if (aValue === null && bValue === null) return 0;
        if (aValue === null) return 1;
        if (bValue === null) return -1;

        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
        }

        if (typeof aValue === "string" && typeof bValue === "string") {
          return sortDirection === "asc"
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }

        return 0;
      });
  }, [optionsData, filterValidOptions, generateOptionsData, sortColumn, sortDirection]);

  const sortedData = processOptionsData;

  const handleSort = (column: keyof CalculatedMetrics) => {
    setSortColumn(column);
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const chartData = useMemo(
    () =>
      sortedData.map((item) => ({
        x: item.daysToExpiration.raw,
        y: item.hedgeEfficiencyScore.raw,
        z: item.totalCost.raw,
        name:
          optionType === "put"
            ? `${item.expiryDate.display} - $${item.strike.raw}`
            : `${item.expiryDate.display} - $${item.strike.display}`,
      })),
    [sortedData, optionType]
  );

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
    <div className={`flex flex-col min-h-screen ${isDarkMode ? "dark" : ""}`}>
      <div className="flex-grow bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 text-gray-800 dark:text-white transition-colors duration-300">
        {/* HEADER */}
        <header className="bg-white bg-opacity-10 dark:bg-gray-800 dark:bg-opacity-30 backdrop-filter backdrop-blur-lg fixed w-full z-10 transition-colors duration-300">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              Crypto Hedge
            </h1>
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

        {/* MAIN */}
        <main className="container mx-auto px-4 pt-24 pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-800 dark:text-white">
              Options Analysis{" "}
              <span className="text-blue-600 dark:text-blue-400">Dashboard</span>
            </h2>
          </motion.div>
          <Breadcrumbs
            items={[
              { label: "Hedge", href: "/hedge" },
            ]}
          />

          {/* DASH CONTROLS */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">
                Current {currency} Price
              </h3>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                ${btcPrice.toLocaleString()}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">
                Select Currency
              </h3>
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
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">
                Option Type
              </h3>
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
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">
                Investment Amount
              </h3>
              <input
                type="number"
                value={investmentAmount}
                onChange={(e) => setInvestmentAmount(Number(e.target.value))}
                className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">
                Target Price ({TARGET_PRICE * 100}%)
              </h3>
              <input
                type="number"
                value={targetPrice}
                onChange={(e) => setTargetPrice(Number(e.target.value))}
                className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
              <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">
                IV Increase (%)
              </h3>
              <input
                type="number"
                value={ivIncrease}
                onChange={(e) => setIvIncrease(Number(e.target.value))}
                className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
              />
            </div>
            {optionType === "ratioBackspread" && (
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
                <h3 className="font-bold mb-2 text-gray-700 dark:text-gray-300">
                  Backspread Ratio
                </h3>
                <input
                  type="number"
                  value={ratioBackspreadRatio}
                  onChange={(e) => setRatioBackspreadRatio(Number(e.target.value))}
                  min={2}
                  step={1}
                  className="w-full p-2 border rounded bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white"
                />
              </div>
            )}
          </div>

          {/* CHART */}
          <div className="mb-8 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">
              Hedge Efficiency Score Visualization
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <XAxis type="number" dataKey="x" name="Days to Expiration" unit=" days" />
                <YAxis type="number" dataKey="y" name="Hedge Efficiency Score" unit="" />
                <ZAxis type="number" dataKey="z" range={[50, 1000]} name="Total Cost" unit="$" />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={chartData} fill="#3B82F6" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* TABLE */}
          <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <table className="min-w-full">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700">
                  <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">
                    Exchange
                  </th>
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
                {sortedData.slice(0, 200).map((option, index) => (
                  <tr
                    key={index}
                    className={
                      index % 2 === 0
                        ? "bg-gray-50 dark:bg-gray-800"
                        : "bg-white dark:bg-gray-700"
                    }
                  >
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                      {option.exchange.display}
                    </td>
                    {columns.map(({ key }) => (
                      <td
                        key={key}
                        className="px-4 py-2 text-gray-800 dark:text-gray-200"
                      >
                        {option[key]?.display}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {/* FOOTER */}
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
