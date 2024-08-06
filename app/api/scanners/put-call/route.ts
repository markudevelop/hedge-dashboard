import { NextResponse } from 'next/server';
import axios from 'axios';

const API_KEY = 'AKI6DSI3A1BXI3LSDA8A';
const API_SECRET = 'OFeVrjr1ShXqrvVnyXwRl5e8s8OraPZYffL91BdQ';

const DATA_BASE_URL = 'https://data.alpaca.markets';

const dataApi = axios.create({
    baseURL: DATA_BASE_URL,
    headers: {
        'APCA-API-KEY-ID': API_KEY,
        'APCA-API-SECRET-KEY': API_SECRET
    }
});

// Utility function to create a controlled delay
function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getActiveStocks() {
    try {
        const response = await dataApi.get('/v1beta1/screener/stocks/most-actives?top=100');
        return response.data.most_actives.map(stock => stock.symbol);
    } catch (error) {
        console.error('Error fetching active stocks:', error.response?.data || error.message);
        return [];
    }
}

async function getMovers() {
    try {
        const response = await dataApi.get('/v1beta1/screener/stocks/movers?top=50');
        const gainers = response.data.gainers.map(stock => stock.symbol);
        const losers = response.data.losers.map(stock => stock.symbol);
        return [...gainers, ...losers];
    } catch (error) {
        console.error('Error fetching movers:', error.response?.data || error.message);
        return [];
    }
}

async function getOptionsSnapshots(symbol: string) {
    try {
        const response = await fetch(`${DATA_BASE_URL}/v1beta1/options/snapshots/${symbol}?feed=indicative&limit=100`, {
            headers: {
                'APCA-API-KEY-ID': API_KEY,
                'APCA-API-SECRET-KEY': API_SECRET,
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.snapshots;
    } catch (error) {
        console.error(`Error fetching options snapshots for ${symbol}:`, error);
        return {};
    }
}

async function getCurrentPrice(symbol: string) {
    try {
        const response = await dataApi.get(`/v2/stocks/${symbol}/trades/latest`);
        return response.data.trade.p;
    } catch (error) {
        console.error(`Error fetching current price for ${symbol}:`, error.response?.data || error.message);
        return null;
    }
}

function parseOptionSymbol(symbol: string) {
    const match = symbol.match(/^(\w+)(\d{6})([CP])(\d+)$/);
    if (!match) return null;
    const [, underlying, dateStr, type, strikeStr] = match;
    const date = new Date(parseInt(dateStr.slice(0, 2)) + 2000, parseInt(dateStr.slice(2, 4)) - 1, parseInt(dateStr.slice(4, 6)));
    const strike = parseInt(strikeStr) / 1000;
    return { underlying, date, type: type as 'C' | 'P', strike };
}

function findATMOptions(optionsSnapshots: any, currentPrice: number) {
    let closestStrike = Infinity;
    let atmOptions = null;

    for (const [symbol, option] of Object.entries(optionsSnapshots)) {
        const parsedSymbol = parseOptionSymbol(symbol);
        if (!parsedSymbol) continue;

        const { date, type, strike } = parsedSymbol;
        const expirationDate = date.toISOString().split('T')[0];

        const strikeDiff = Math.abs(strike - currentPrice);
        if (strikeDiff < Math.abs(closestStrike - currentPrice)) {
            closestStrike = strike;
            atmOptions = {
                expiration: expirationDate,
                strike: closestStrike,
                call: null,
                put: null
            };
        }

        if (strike === closestStrike) {
            if (type === 'C') {
                atmOptions.call = { symbol, ...option, strike };
            } else {
                atmOptions.put = { symbol, ...option, strike };
            }
        }
    }

    return atmOptions;
}

function getAskPrice(option: any) {
    return option?.latestQuote?.ap || 0;
}

function getBidPrice(option: any) {
    return option?.latestQuote?.bp || 0;
}

function calculateDaysToExpiration(expirationDate: string): number {
    const today = new Date();
    const expiration = new Date(expirationDate);
    const timeDiff = expiration.getTime() - today.getTime();
    return Math.ceil(timeDiff / (1000 * 3600 * 24));
}

function findNearATMOptions(optionsSnapshots: any, currentPrice: number) {
    let closestStrikes = [];
    const strikeRange = currentPrice * 0.05; // Look for strikes within 5% of current price

    for (const [symbol, option] of Object.entries(optionsSnapshots)) {
        const parsedSymbol = parseOptionSymbol(symbol);
        if (!parsedSymbol) continue;

        const { date, type, strike } = parsedSymbol;
        const expirationDate = date.toISOString().split('T')[0];

        if (Math.abs(strike - currentPrice) <= strikeRange) {
            closestStrikes.push({
                strike,
                expiration: expirationDate,
                type,
                symbol,
                option
            });
        }
    }

    // Sort strikes from closest to furthest from current price
    closestStrikes.sort((a, b) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice));

    // Group options by strike and expiration
    const groupedOptions = closestStrikes.reduce((acc, { strike, expiration, type, symbol, option }) => {
        const key = `${strike}-${expiration}`;
        if (!acc[key]) {
            acc[key] = { expiration, strike, call: null, put: null };
        }
        acc[key][type.toLowerCase()] = { symbol, ...option, strike };
        return acc;
    }, {});

    return Object.values(groupedOptions);
}

function findSyntheticOpportunities(atmOptions: any, currentPrice: number, threshold: number = 0.1) {
    const opportunities = [];

    if (!atmOptions || !atmOptions.call || !atmOptions.put) {
        return opportunities;
    }

    const { expiration, strike, call, put } = atmOptions;

    // Check if the option has at least 2 days to expiration
    const daysToExpiration = calculateDaysToExpiration(expiration);
    if (daysToExpiration < 2) {
        console.log('Option expiring too soon, skipping:', expiration);
        return opportunities;
    }

    const callAskPrice = getAskPrice(call);
    const putAskPrice = getAskPrice(put);
    const callBidPrice = getBidPrice(call);
    const putBidPrice = getBidPrice(put);

    // Calculate the price adjustment
    const priceAdjustment = strike - currentPrice;

    // Check for synthetic long stock (credit)
    const longCredit = putBidPrice - callAskPrice - priceAdjustment;
    
    // Check for synthetic short stock (credit)
    const shortCredit = callBidPrice - putAskPrice + priceAdjustment;

    console.log('ATM Opportunity found', expiration, strike, 'Long Credit:', longCredit, 'Short Credit:', shortCredit);

    if (longCredit > threshold) {
        opportunities.push({
            type: 'Synthetic Long Stock',
            expiration,
            daysToExpiration,
            strike,
            currentPrice,
            priceAdjustment,
            credit: longCredit,
            callSymbol: call.symbol,
            putSymbol: put.symbol,
            action: `Buy Call at ${callAskPrice}, Sell Put at ${putBidPrice}`,
            callPrice: callAskPrice,
            putPrice: putBidPrice
        });
    }

    // Disabled for now
    // if (shortCredit > threshold) {
    //     opportunities.push({
    //         type: 'Synthetic Short Stock',
    //         expiration,
    //         daysToExpiration,
    //         strike,
    //         currentPrice,
    //         priceAdjustment,
    //         credit: shortCredit,
    //         callSymbol: call.symbol,
    //         putSymbol: put.symbol,
    //         action: `Sell Call at ${callBidPrice}, Buy Put at ${putAskPrice}`,
    //         callPrice: callBidPrice,
    //         putPrice: putAskPrice
    //     });
    // }

    return opportunities;
}

async function scanStock(symbol: string, threshold: number) {
    const currentPrice = await getCurrentPrice(symbol);
    if (!currentPrice) return null;

    const optionsSnapshots = await getOptionsSnapshots(symbol);
    const atmOptions = findATMOptions(optionsSnapshots, currentPrice);
    const syntheticOpportunities = findSyntheticOpportunities(atmOptions, currentPrice, threshold);

    return {
        symbol,
        currentPrice,
        atmStrike: atmOptions ? atmOptions.strike : null,
        syntheticOpportunities
    };
}

async function scanStocksWithDelay(stocks: string[], threshold: number) {
    const results = [];
    for (const symbol of stocks) {
        const result = await scanStock(symbol, threshold);
        if (result !== null && result.syntheticOpportunities.length > 0) {
            results.push(result);
        }
        await delay(2000); // 1 second delay between each stock scan
    }
    return results;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const threshold = parseFloat(searchParams.get('threshold') || '0.1');

        const [activeStocks, movers] = await Promise.all([getActiveStocks(), getMovers()]);

        const stocksToScan = [...new Set([...activeStocks, ...movers])];

        const validResults = await scanStocksWithDelay(stocksToScan, threshold);

        return NextResponse.json({
            scannedStocks: stocksToScan.length,
            results: validResults
        });
    } catch (error) {
        console.error('API route error:', error);
        return NextResponse.json({ error: 'An error occurred while processing the request' }, { status: 500 });
    }
}