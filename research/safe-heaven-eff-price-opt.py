import yfinance as yf
from datetime import datetime, timedelta
import pandas as pd

def get_next_n_monthly_expiries(n):
    """Get the next n monthly expiration dates."""
    today = datetime.now()
    expiries = []
    current_month = today.replace(day=1)
    
    while len(expiries) < n:
        next_month = current_month + timedelta(days=32)
        third_friday = next_month.replace(day=1) + timedelta(days=(4 - next_month.replace(day=1).weekday() + 7) % 7 + 14)
        if third_friday > today:
            expiries.append(third_friday.strftime('%Y-%m-%d'))
        current_month = next_month
    
    return expiries

def fetch_spy_options(ticker, expiry_date):
    """Fetch options data for a specific expiry date."""
    try:
        options = ticker.option_chain(expiry_date)
        return options.puts  # We're interested in put options for downside protection
    except ValueError as e:
        print(f"Error fetching options for {expiry_date}: {e}")
        return pd.DataFrame()

def calcEfficientPrice(K: float, target_price: float, eff: float):
    '''
    K: strike price
    target_price: target price per share
    eff: efficient boundary
    '''
    return (K - target_price) / (1 + eff)

ticker = yf.Ticker('BITO')
expiry_dates = get_next_n_monthly_expiries(3)  # Increased to 3 to have more options

for expiry_date in expiry_dates:
    opt = fetch_spy_options(ticker, expiry_date)
    
    if opt.empty:
        continue
    
    current_price = ticker.info['regularMarketOpen']
    target_price = current_price * 0.85
    eff = 6.8 # 5.4

    opt['eff_price'] = opt.apply(lambda x: calcEfficientPrice(x['strike'], target_price, eff), axis=1)

    filtered_opt = opt.loc[opt['lastPrice'] <= opt['eff_price']]
    
    if not filtered_opt.empty:
        print(f"\nOptions for expiry date: {expiry_date}")
        print(filtered_opt[['strike', 'lastPrice', 'volume', 'openInterest', 'eff_price']])
    else:
        print(f"\nNo options meeting criteria for expiry date: {expiry_date}")

print(f"\nCurrent stock price: ${current_price:.2f}")
print(f"Target price (70% of current): ${target_price:.2f}")