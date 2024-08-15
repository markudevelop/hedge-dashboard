import yfinance as yf
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

# Fetch SPY ticker
ticker = yf.Ticker('BITO')

# Get all option expiration dates
option_dates = pd.to_datetime(ticker.options)

# Filter dates for the next 6 months
end_date = datetime.now() + timedelta(400)
filtered_dates = option_dates[option_dates <= end_date]

# Initialize an empty DataFrame to collect all options data
all_options = pd.DataFrame()

# Loop through each expiration date and fetch options
for option_date in filtered_dates:
    opt_chain = ticker.option_chain(option_date.strftime('%Y-%m-%d')).puts
    opt_chain['expirationDate'] = option_date  # Keep track of expiration date
    all_options = pd.concat([all_options, opt_chain], ignore_index=True)

# Calculate the efficient price
def calcEfficientPrice(K: float, target_price: float, eff: float):
    '''
    K: strike price
    target_price: target price per share
    eff: efficient boundary
    '''
    return (K - target_price) / (1 + eff)

# Example target price calculation and efficiency factor
current_price = ticker.info['regularMarketOpen']
target_price = ticker.info['regularMarketOpen'] * 0.80
eff = 5.4

# Apply the efficient price calculation to all options
all_options['eff_price'] = all_options.apply(
    lambda x: calcEfficientPrice(x['strike'], target_price, eff), axis=1)

# Filter options where the last price is less than or equal to the efficient price
filtered_options = all_options.loc[all_options['lastPrice'] <= all_options['eff_price']]

# Display the filtered options
# print(filtered_options.head(50))

if not filtered_options.empty:
    print(f"\nOptions for expiry date: ")
    print(filtered_options[['expirationDate', 'strike', 'lastPrice', 'volume', 'openInterest', 'eff_price']])
else:
    print(f"\nNo options meeting criteria for expiry date:")

print(f"\nCurrent stock price: ${current_price:.2f}")
print(f"Target price ({(target_price / current_price) * 100} of current): ${target_price:.2f}")
