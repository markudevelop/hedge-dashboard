import pandas as pd
import numpy as np
from scipy.stats import norm
import yfinance as yf
from datetime import datetime, timedelta

def black_scholes_put(S, K, T, r, sigma):
    """Calculate Black-Scholes price for a put option."""
    d1 = (np.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)
    put_price = K * np.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
    return put_price

def fetch_spy_options(ticker, expiry_date):
    """Fetch options data for a specific expiry date."""
    options = ticker.option_chain(expiry_date)
    return options.puts  # We're interested in put options for downside protection

def analyze_safe_haven_options(current_price, target_price_pct, eta, options_data, time_to_expiry, risk_free_rate, volatility):
    """Analyze options to find cost-effective safe haven hedges."""
    target_price = current_price * target_price_pct
    
    # Original intrinsic value approach
    options_data['Max Cost-Effective Price (Intrinsic)'] = (options_data['strike'] - target_price) / (1 + eta)
    options_data['Is Cost-Effective (Intrinsic)'] = options_data['lastPrice'] <= options_data['Max Cost-Effective Price (Intrinsic)']
    options_data['Expected Return (Intrinsic) (%)'] = (options_data['strike'] - target_price - options_data['lastPrice']) / options_data['lastPrice'] * 100
    
    # Black-Scholes approach
    options_data['Theoretical Price'] = options_data['strike'].apply(
        lambda x: black_scholes_put(current_price, x, time_to_expiry, risk_free_rate, volatility)
    )
    options_data['Is Cost-Effective (Black-Scholes)'] = options_data['Theoretical Price'] <= options_data['Max Cost-Effective Price (Intrinsic)']
    options_data['Expected Return (Black-Scholes) (%)'] = (options_data['strike'] - target_price - options_data['Theoretical Price']) / options_data['Theoretical Price'] * 100
    
    return options_data.sort_values('Expected Return (Intrinsic) (%)', ascending=False)

def get_next_n_monthly_expiries(n):
    """Get the next n monthly expiration dates."""
    today = datetime.now()
    expiries = []
    current_month = today.replace(day=1)
    
    for _ in range(n):
        next_month = current_month + timedelta(days=32)
        third_friday = next_month.replace(day=1) + timedelta(days=(4 - next_month.replace(day=1).weekday() + 7) % 7 + 14)
        expiries.append(third_friday.strftime('%Y-%m-%d'))
        current_month = next_month
    
    return expiries

def main():
    # Setup
    ticker_symbol = "SPY"
    target_price_pct = 0.85
    eta = 6.8
    risk_free_rate = 0.02  # 2% annual rate
    num_months = 1  # Analyze options for the next 3 months

    # Fetch ticker data
    ticker = yf.Ticker(ticker_symbol)
    current_price = ticker.info['regularMarketOpen']
    volatility = ticker.info['regularMarketOpen'] * np.sqrt(252) / 100  # Estimated from daily price movement

    # Get expiration dates
    expiry_dates = get_next_n_monthly_expiries(num_months)

    # Analyze options for each expiry date
    all_analyzed_options = []
    for expiry_date in expiry_dates:
        options_data = fetch_spy_options(ticker, expiry_date)
        time_to_expiry = (datetime.strptime(expiry_date, '%Y-%m-%d') - datetime.now()).days / 365
        
        analyzed_options = analyze_safe_haven_options(
            current_price, target_price_pct, eta, options_data, 
            time_to_expiry, risk_free_rate, volatility
        )
        analyzed_options['Expiry'] = expiry_date
        all_analyzed_options.append(analyzed_options)

    # Combine all analyzed options
    combined_options = pd.concat(all_analyzed_options)

    # Sort and display results
    columns_to_display = [
        'Expiry', 'strike', 'lastPrice', 'volume', 'openInterest',
        'Max Cost-Effective Price (Intrinsic)', 'Theoretical Price',
        'Is Cost-Effective (Intrinsic)', 'Is Cost-Effective (Black-Scholes)',
        'Expected Return (Intrinsic) (%)', 'Expected Return (Black-Scholes) (%)'
    ]
    sorted_options = combined_options.sort_values(['Expiry', 'Expected Return (Intrinsic) (%)'], ascending=[True, False])
    
    pd.set_option('display.max_rows', None)
    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', None)
    print(sorted_options[columns_to_display].head())

if __name__ == "__main__":
    main()