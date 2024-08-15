import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import yfinance as yf
from datetime import datetime, timedelta

np.random.seed(1234)

def getQuantilePath(trajectories: np.array, q: float=0.5):
    quantile = np.quantile(trajectories[:, -1], q=q)
    path = trajectories[np.abs(quantile - trajectories[:, -1]).argmin()]
    return quantile, path

def sp500Sim(data: pd.DataFrame, allocation: float=0, 
             payoffs: list=[8.62, 0, 0, 0, 0],
             years: int=25, samples: int=10000):
    payoffs = np.asarray(payoffs)
    sims = np.random.choice(data.index, size=(samples, years))
    ret_cats = data['category'].values[sims]
    risk_rets = (1 - allocation) * (data['returns'].values[sims] + 1)
    safe_haven_rets = allocation * payoffs[ret_cats]
    return np.cumprod(risk_rets + safe_haven_rets, axis=1)

def calcEfficientPrice(K: float, target_price: float, eff: float):
    return (K - target_price) / (1 + eff)

# Load and process S&P 500 data
url = "http://www.econ.yale.edu/~shiller/data/ie_data.xls"
df = pd.read_excel(url, sheet_name='Data', skiprows=7)
df = df[['Date', 'Price.1']]
df.columns = ['date', 'real_total_return_price']
df.drop(df.index[-1], axis=0, inplace=True)

df['returns'] = df['real_total_return_price'].pct_change()
df['log_returns'] = np.log(1 + df['returns'])
df['annual_returns'] = np.exp(df['log_returns'].rolling(12).sum()) - 1
df['date'] = df['date'].astype(str)
df['year'] = df['date'].map(lambda x: int(x.split('.')[0]))
df_rets = df.loc[(df['year']>1900) & 
                 (df['year']<2021)][['date', 'year', 'annual_returns']].copy()
df_rets.reset_index(inplace=True)
df_rets.drop('index', inplace=True, axis=1)

# Add bin mapping
bins = [-10, -0.15, 0, 0.15, 0.3, 10]
categories = [0, 1, 2, 3, 4]
labels = ['<-15%', '-15% to 0%', '0% to 15%', '15% to 30%', '>30%']
cats = pd.cut(df_rets['annual_returns'], bins, labels=categories)
labs = pd.cut(df_rets['annual_returns'], bins, labels=labels)
df_agg = pd.concat([df_rets, cats, labs], axis=1)
df_agg.columns = ['date', 'year', 'returns', 'category', 'label']
df_agg['category'] = df_agg['category'].astype(int)

# Plot 1: Distribution of annual S&P 500 returns
colors = plt.rcParams['axes.prop_cycle'].by_key()['color']
fig, ax = plt.subplots(figsize=(12, 8))
ax.bar(categories,
       df_agg['category'].value_counts().sort_index(),
       color=colors[1])
ax.set_xticks(categories)
ax.set_xticklabels(labels)
plt.xlabel('Annual S&P 500 Return (%)')
plt.ylabel('Frequency')
plt.title('Annual S&P 500 Returns from 1901-2020')
plt.xticks(rotation=45)
plt.tight_layout()
plt.show()

# Run simulations
traj = sp500Sim(df_agg, allocation=0)
ins_traj = sp500Sim(df_agg, allocation=0.035)

def plot_returns(trajectories, title):
    perc50, path50 = getQuantilePath(trajectories)
    perc95, path95 = getQuantilePath(trajectories, q=0.95)
    perc5, path5 = getQuantilePath(trajectories, q=0.05)
    path_avg = trajectories.mean(axis=0)

    fig = plt.figure(figsize=(15, 8))
    gs = fig.add_gridspec(1, 2, width_ratios=(3, 1))
    ax = fig.add_subplot(gs[0])
    ax_hist = fig.add_subplot(gs[1])

    ax.plot(path50, label='Median')
    ax.plot(path95, label=r'$95^{th}$ Percentile')
    ax.plot(path5, label=r'$5^{th}$ Percentile')
    ax.plot(path_avg, label='Mean', linestyle=':')
    ax.fill_between(np.arange(trajectories.shape[1]), 
                    y1=trajectories.min(axis=0),
                    y2=trajectories.max(axis=0),
                    alpha=0.3, color=colors[4])
    ax.set_title(title)
    ax.set_xlabel('Years')
    ax.set_ylabel('Portfolio Value')
    ax.semilogy()
    ax.legend(loc=3)

    growth = (np.power(trajectories[:, -1], 1/25) - 1) * 100
    growth_med = (np.power(path50[-1], 1/25) -1) * 100
    growth_avg = (np.power(path_avg[-1], 1/25) - 1) * 100
    ax_hist.hist(growth, orientation='horizontal', bins=50, 
                 color=colors[4], alpha=0.3)
    ax_hist.axhline(0, label='Break Even', color='k', linestyle=':')
    ax_hist.axhline(growth_med, label='Median', color=colors[0])
    ax_hist.axhline(growth_avg, label='Mean', color=colors[3])
    ax_hist.set_ylabel('Compound Annual Growth Rate (%)')
    ax_hist.set_xlabel('Frequency')
    ax_hist.legend()

    plt.tight_layout()
    plt.show()

# Plot 2: S&P 500 returns without safe haven allocation
plot_returns(traj, 'S&P 500 Returns (1901-2020)')

# Plot 3: Optimal insurance allocation
alloc_frac = np.linspace(0, 0.20, 101)
N = 10
vals5 = np.zeros((len(alloc_frac), N))
vals50 = vals5.copy()
vals95 = vals5.copy()

for i in range(N):
    for j, f in enumerate(alloc_frac):
        traj = sp500Sim(df_agg, allocation=f)
        perc5, _ = getQuantilePath(traj, 0.05)
        perc50, _ = getQuantilePath(traj, 0.5)
        perc95, _ = getQuantilePath(traj, 0.95)

        vals5[j, i] += perc5
        vals50[j, i] += perc50
        vals95[j, i] += perc95

smooth5 = vals5.mean(axis=1)
smooth50 = vals50.mean(axis=1)
smooth95 = vals95.mean(axis=1)

plt.figure(figsize=(12, 8))
# Plot lines with specific colors
plt.plot(alloc_frac * 100, smooth5, label=r'$5^{th}$ Percentile', color='blue', linewidth=2)
plt.plot(alloc_frac * 100, smooth50, label=r'$50^{th}$ Percentile', color='orange', linewidth=2)
plt.plot(alloc_frac * 100, smooth95, label=r'$95^{th}$ Percentile', color='green', linewidth=2)

# Scatter markers with matching colors
plt.scatter((alloc_frac * 100)[smooth5.argmax()], smooth5.max(), marker='*', s=200, color='blue')
plt.scatter((alloc_frac * 100)[smooth50.argmax()], smooth50.max(), marker='*', s=200, color='orange')
plt.scatter((alloc_frac * 100)[smooth95.argmax()], smooth95.max(), marker='*', s=200, color='green')

plt.xlabel('Allocation to Safe Haven (%)')
plt.ylabel('CAGR (%)')
plt.title('Optimal Insurance Allocation')
plt.semilogy()
plt.legend(loc='upper right')  # Adjust this as needed
plt.grid(True)
plt.show()

# Plot 4: S&P 500 returns with 3.5% insurance allocation
plot_returns(ins_traj, 'S&P 500 Returns with 3.5% Insurance Allocation')

# Plot 5: Cost-effective insurance boundary
alloc_frac = np.linspace(0, 0.20, 41)
ins_cost0 = 8.62
ins_cost = np.linspace(0.5, 1, 51)
N = 20
vals5 = np.zeros((len(alloc_frac), len(ins_cost), N))
vals50 = vals5.copy()
vals95 = vals5.copy()

for n in range(N):
    for i, c in enumerate(ins_cost):
        payoffs = [ins_cost0 * c, 0, 0, 0, 0]
        for j, f in enumerate(alloc_frac):
            traj = sp500Sim(df_agg, allocation=f, payoffs=payoffs)
            perc5, _ = getQuantilePath(traj, 0.05)
            perc50, _ = getQuantilePath(traj, 0.5)
            perc95, _ = getQuantilePath(traj, 0.95)

            vals5[j, i, n] += perc5
            vals50[j, i, n] += perc50
            vals95[j, i, n] += perc95

avg5 = vals5.mean(axis=2)
avg50 = vals50.mean(axis=2)
avg95 = vals95.mean(axis=2)

plt.figure(figsize=(12, 8))
plt.plot(ins_cost * ins_cost0, avg5.max(axis=0), label='5th Percentile')
plt.plot(ins_cost * ins_cost0, avg50.max(axis=0), label='50th Percentile')
plt.plot(ins_cost * ins_cost0, avg95.max(axis=0), label='95th Percentile')
plt.axhline(y=avg50[0, 0], color='k', linestyle='--', label='Unhedged CAGR')
plt.axvline(x=6.8, color='r', linestyle='--', label='Break-even point')
plt.xlabel('Insurance Payoff (%)')
plt.ylabel('CAGR (%)')
plt.title('Cost-Effective Insurance Boundary')
plt.legend()
plt.grid(True)
plt.show()

# Plot 6: Option payoff profiles
def plot_option_payoff(option_type, strike_price, premium):
    stock_prices = np.linspace(0.5 * strike_price, 1.5 * strike_price, 100)
    if option_type == 'call':
        payoff = np.maximum(stock_prices - strike_price, 0) - premium
    else:  # put
        payoff = np.maximum(strike_price - stock_prices, 0) - premium
    
    plt.figure(figsize=(10, 6))
    plt.plot(stock_prices, payoff)
    plt.axhline(y=0, color='r', linestyle='--')
    plt.axvline(x=strike_price, color='g', linestyle='--')
    plt.xlabel('Stock Price')
    plt.ylabel('Profit/Loss')
    plt.title(f'{option_type.capitalize()} Option Payoff')
    plt.grid(True)
    plt.show()

# Plot call option payoff
plot_option_payoff('call', 420, 5)

# Plot put option payoff
plot_option_payoff('put', 430, 4)

# Get option data
ticker = yf.Ticker('SPY')
option_idx = np.abs((pd.to_datetime(ticker.options) - 
                     (datetime.now() + timedelta(365))).days).argmin()
option_date = ticker.options[option_idx]
opt = ticker.option_chain(option_date).puts

# Calculate efficient prices
try:
    target_price = ticker.info['regularMarketPrice'] * 0.85
except KeyError:
    # If 'regularMarketPrice' is not available, use the last available price
    target_price = ticker.history(period="1d")['Close'].iloc[-1] * 0.85

eff = 6.8

opt['eff_price'] = opt.apply(lambda x: calcEfficientPrice(x['strike'],
                                                          target_price, eff), axis=1)

cost_effective_options = opt.loc[opt['lastPrice'] <= opt['eff_price']]
print("Cost-effective options:")
print(cost_effective_options)