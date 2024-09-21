import { NextResponse } from 'next/server';

type TradeData = {
  trade_id: string;
  instrument_name: string;
  direction: 'buy' | 'sell';
  price: number;
  quantity: number;
  timestamp: number;
};

type ResponseData = {
  trades?: TradeData[];
  error?: string;
};

async function getDeribitAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const tokenResponse = await fetch('https://www.deribit.com/api/v2/public/auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenData.result?.access_token) {
    throw new Error('Failed to obtain access token from Deribit.');
  }

  return tokenData.result.access_token;
}

async function getInstruments(currency: string): Promise<string[]> {
  const instrumentsResponse = await fetch(`https://www.deribit.com/api/v2/public/get_instruments?currency=${currency}&kind=option`);
  const instrumentsData = await instrumentsResponse.json();

  if (!instrumentsData.result) {
    throw new Error('Failed to fetch instruments from Deribit.');
  }

  return instrumentsData.result.map((instrument: any) => instrument.instrument_name);
}

async function getTradesForInstrument(accessToken: string, instrument: string): Promise<TradeData[]> {
  const tradesResponse = await fetch(`https://www.deribit.com/api/v2/private/get_user_trades_by_instrument?instrument_name=${instrument}&count=50`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const tradesData = await tradesResponse.json();

  if (!tradesData.result?.trades) {
    return [];
  }

  return tradesData.result.trades.map((trade: any) => ({
    trade_id: trade.trade_id,
    instrument_name: trade.instrument_name,
    direction: trade.direction,
    price: parseFloat(trade.price),
    quantity: parseFloat(trade.amount),
    timestamp: new Date(trade.timestamp).getTime(),
  }));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const currency = searchParams.get('currency');

    if (!currency) {
      return NextResponse.json({ error: 'Missing currency parameter' }, { status: 400 });
    }

    const { DERIBIT_CLIENT_ID, DERIBIT_CLIENT_SECRET } = process.env;

    if (!DERIBIT_CLIENT_ID || !DERIBIT_CLIENT_SECRET) {
      throw new Error('Deribit API credentials are not set.');
    }

    console.log('Client ID:', process.env.DERIBIT_CLIENT_ID);
console.log('Client Secret:', process.env.DERIBIT_CLIENT_SECRET);

    const accessToken = await getDeribitAccessToken(DERIBIT_CLIENT_ID, DERIBIT_CLIENT_SECRET);
    const instruments = await getInstruments(currency);

    const allTrades: TradeData[] = [];
    for (const instrument of instruments) {
      const trades = await getTradesForInstrument(accessToken, instrument);
      allTrades.push(...trades);
    }

    const limitedTrades = allTrades.slice(0, 100);

    return NextResponse.json({ trades: limitedTrades }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching Deribit trades:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}