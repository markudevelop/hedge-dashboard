import yfinance as yf
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

ticker = yf.Ticker('SPY')
option_idx = np.abs((pd.to_datetime(ticker.options) - 
                      (datetime.now() + timedelta(30 * 3))).days).argmin()
option_date = ticker.options[option_idx]
option_date

opt = ticker.option_chain(option_date).puts
opt.head()

def calcEfficientPrice(K: float, target_price: float, eff: float):
  '''
  K: strike price
  target_price: target price per share
  eff: efficient boundary
  '''
  return (K - target_price) / (1 + eff)

target_price = ticker.info['regularMarketOpen'] * 0.85
eff = 6.8

opt['eff_price'] = opt.apply(lambda x: calcEfficientPrice( 
                                         x['strike'],
                                         target_price, eff), axis=1)

filtered_options = opt.loc[opt['lastPrice']<=opt['eff_price']]

print(option_date)
print(filtered_options[['strike', 'lastPrice', 'volume', 'openInterest', 'eff_price']])
