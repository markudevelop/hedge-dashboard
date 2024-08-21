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
    exchange: 'Deribit' | 'Bybit' | 'Alpaca';
};

type CalculatedMetrics = {
    expiryDate: { display: string; raw: number };
    strike: { display: string; raw: number };
    optionPrice: { display: string; raw: number };
    markPrice: { display: string; raw: number };
    bidPrice: { display: string; raw: number | null };
    askPrice: { display: string; raw: number };
    contractCost: { display: string; raw: number };
    contracts: { display: string; raw: number };
    totalCost: { display: string; raw: number };
    daysToExpiration: { display: string; raw: number };
    impliedVolatility: { display: string; raw: number };
    delta: { display: string; raw: number };
    gamma: { display: string; raw: number };
    vega: { display: string; raw: number };
    theta: { display: string; raw: number };
    theoreticalPrice: { display: string; raw: number };
    theoreticalPriceAtTarget: { display: string; raw: number };
    hedgeCoverageReturn: { display: string; raw: number };
    hedgeEfficiency: { display: string; raw: number };
    hedgeEfficiencyPerDay: { display: string; raw: number };
    exchange: { display: string; raw: string };
    hedgeEfficiencyScore: { display: string; raw: number };
};

const calculateMetrics = (
    option: OptionData,
    investmentAmount: number,
    targetPrice: number,
    ivIncrease: number
): CalculatedMetrics | null => {
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
        exchange: { display: option.exchange, raw: option.exchange },
        hedgeEfficiencyScore: { display: hedgeEfficiencyScore.toFixed(4), raw: hedgeEfficiencyScore },
    };
};

// Helper functions
export const cumulativeNormalDistribution = (x: number): number => {
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

export const blackScholesPut = (S: number, K: number, T: number, r: number, sigma: number): number => {
    const d1 = (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return K * Math.exp(-r * T) * cumulativeNormalDistribution(-d2) - S * cumulativeNormalDistribution(-d1);
};

export const blackScholesCall = (S: number, K: number, T: number, r: number, sigma: number): number => {
    const d1 = (Math.log(S / K) + (r + Math.pow(sigma, 2) / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);
    return S * cumulativeNormalDistribution(d1) - K * Math.exp(-r * T) * cumulativeNormalDistribution(d2);
};


// function mapStockOptionDataToOptionData(stockOption: StockOptionData): OptionData {
//     // Format the expiration date to YYMMDD
//     const expirationDate = new Date(stockOption.expiration_date);
//     const formattedExpiration = expirationDate.toISOString().slice(2,10).replace(/-/g, '');
  
//     // Create the instrument name
//     const instrumentName = `${stockOption.symbol}-${formattedExpiration}-${stockOption.strike_price}-${stockOption.option_type.toUpperCase()}`;
  
//     // Calculate mark price as the average of bid and ask
//     const markPrice = (stockOption.bid + stockOption.ask) / 2;
  
//     return {
//       instrument_name: instrumentName,
//       underlying_price: stockOption.underlying_price,
//       mark_price: markPrice,
//       bid_price: stockOption.bid,
//       ask_price: stockOption.ask,
//       mark_iv: stockOption.impliedVolatility * 100, // Convert to percentage
//       underlying_index: stockOption.symbol, // Assuming the symbol is the underlying index
//       creation_timestamp: Date.now(), // Use current timestamp as we don't have this in StockOptionData
//       open_interest: stockOption.open_interest,
//       exchange: 'Alpaca', // Default to Deribit as we don't have this information in StockOptionData
//     };
//   }