import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import yfinance as yf
from datetime import datetime, timedelta
from py_vollib.black_scholes import black_scholes as bs
from py_vollib.black_scholes.greeks.analytical import delta, gamma, vega, theta, rho

np.random.seed(1234)

def getQuantilePath(trajectories: np.array, q: float=0.5):
    quantile = np.quantile(trajectories[:, -1], q=q)
    path = trajectories[np.abs(quantile - trajectories[:, -1]).argmin()]
    return quantile, path

# Update bitcoinSim function to use the new categories
def bitcoinSim(data: pd.DataFrame, allocation: float=0, 
               payoffs: list=[5.34, 0, 0, 0, 0],
               years: int=25, samples: int=10000):
    payoffs = np.asarray(payoffs)
    sims = np.random.choice(data.index, size=(samples, years))
    ret_cats = data['category'].values[sims]
    # Calc returns
    risk_rets = (1 - allocation) * (data['returns'].values[sims] + 1)
    safe_haven_rets = allocation * payoffs[ret_cats]
    return np.cumprod(risk_rets + safe_haven_rets, axis=1)

def calcEfficientPrice(K: float, target_price: float, eff: float):
    return (K - target_price) / (1 + eff)

# Load and process Bitcoin data
ticker = yf.Ticker("BTC-USD")
df = ticker.history(start="2010-01-01", end=datetime.now().strftime('%Y-%m-%d'), interval='1mo')
df.reset_index(inplace=True)
df = df[['Date', 'Close']].copy()
df.columns = ['date', 'real_total_return_price']

df['returns'] = df['real_total_return_price'].pct_change()
df['log_returns'] = np.log(1 + df['returns'])
df['annual_returns'] = np.exp(df['log_returns'].rolling(12).sum()) - 1
df['year'] = df['date'].dt.year

df_rets = df.loc[(df['year']>1)][['date', 'year', 'annual_returns']].copy()

df_rets.dropna(subset=['annual_returns'], inplace=True)
df_rets.dropna(subset=['annual_returns'], inplace=True)

df_rets.reset_index(inplace=True)
df_rets.drop('index', inplace=True, axis=1)
df_rets.head()


# Adjust bin mapping for more granularity
bins = [-100, -0.15, 0, 0.15, 0.3, 100]
categories = [0, 1, 2, 3, 4]
labels = ['<-15%', '-15% to 0%', '0% to 15%', '15% to 30%', '>30%']

cats = pd.cut(df_rets['annual_returns'], bins, labels=categories)
labs = pd.cut(df_rets['annual_returns'], bins, labels=labels)

df_agg = pd.concat([df_rets, cats, labs], axis=1)
df_agg.columns = ['date', 'year', 'returns', 'category', 'label']
df_agg['category'] = df_agg['category'].astype(int)

# Plot the results
colors = plt.rcParams['axes.prop_cycle'].by_key()['color']
fig, ax = plt.subplots(figsize=(12, 8))
ax.bar(categories,
       df_agg['category'].value_counts().sort_index(),
       color=colors[1])
ax.set_xticks(categories)
ax.set_xticklabels(labels)
plt.xlabel('Annual Bitcoin Return (%)')
plt.ylabel('Frequency')
plt.title('Annual Bitcoin Returns from 2013-2024')
plt.xticks(rotation=45)
plt.tight_layout()
plt.show()

# With this we can figure out the break even payoff for insurance
# 107
# Category '<-15%': 20 occurrences
# Category '-15% to 0%': 6 occurrences
# Category '0% to 15%': 3 occurrences
# Category '15% to 30%': 6 occurrences
# Category '>30%': 72 occurrences
# 20 / 107 = 0.1869158879 * 100 = 18.69158879% 
# inverse = 1 / 0.1869158879 = 5.3499999986
# Our break even payoff for insurance is 534% -100 to  account for paid premium
# 534-100 = 434% vs 762% for SPY

category_counts = df_agg['category'].value_counts().sort_index()
for category, label in zip(category_counts.index, labels):
    print(f"Category '{label}': {category_counts[category]} occurrences")


# # Run simulations
traj = bitcoinSim(df_agg, allocation=0)

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

    growth = (np.power(trajectories[:, -1], 1/25) - 1) * 100  # 25-year CAGR
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

# # Plot 2: Bitcoin returns without safe haven allocation
plot_returns(traj, 'Bitcoin Returns')

# # Plot 3: Optimal insurance allocation
alloc_frac = np.linspace(0, 0.4, 101)
N = 10
vals5 = np.zeros((len(alloc_frac), N))
vals50 = vals5.copy()
vals95 = vals5.copy()

for i in range(N):
    for j, f in enumerate(alloc_frac):
        traj = bitcoinSim(df_agg, allocation=f)
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
plt.plot(alloc_frac * 100, smooth5, label=r'$5^{th}$ Percentile', color='blue', linewidth=2)
plt.plot(alloc_frac * 100, smooth50, label=r'$50^{th}$ Percentile', color='orange', linewidth=2)
plt.plot(alloc_frac * 100, smooth95, label=r'$95^{th}$ Percentile', color='green', linewidth=2)

plt.scatter((alloc_frac * 100)[smooth5.argmax()], smooth5.max(), marker='*', s=200, color='blue')
plt.scatter((alloc_frac * 100)[smooth50.argmax()], smooth50.max(), marker='*', s=200, color='orange')
plt.scatter((alloc_frac * 100)[smooth95.argmax()], smooth95.max(), marker='*', s=200, color='green')

plt.xlabel('Allocation to Safe Haven (%)')
plt.ylabel('CAGR (%)')
plt.title('Optimal Insurance Allocation for Bitcoin')
plt.semilogy()
plt.legend(loc='upper right')
plt.grid(True)
plt.show()

# # Plot 4: Bitcoin returns with optimal insurance allocation
# ins_traj = bitcoinSim(df_agg, allocation=0.095)

optimal_allocation = alloc_frac[smooth50.argmax()]
ins_traj = bitcoinSim(df_agg, allocation=optimal_allocation)
plot_returns(ins_traj, f'Bitcoin Returns with {optimal_allocation:.1%} Insurance Allocation')

# # Plot 5: Cost-effective insurance boundary
alloc_frac = np.linspace(0, 0.40, 41)
ins_cost0 = 5.34
ins_cost = np.linspace(0.5, 1, 51)
N = 20 # Multiple runs to smooth out results
vals5 = np.zeros((len(alloc_frac), len(ins_cost), N))
vals50 = vals5.copy()
vals95 = vals5.copy()

for n in range(N):
  for i, c in enumerate(ins_cost):
    payoffs = [ins_cost0 * c, 0, 0, 0, 0]
    for j, f in enumerate(alloc_frac):
      traj = bitcoinSim(df_agg, allocation=f,
                      payoffs=payoffs)
      perc5, _ = getQuantilePath(traj, 0.05)
      perc50, _ = getQuantilePath(traj, 0.5)
      perc95, _ = getQuantilePath(traj, 0.95)

      vals5[j, i, n] += perc5
      vals50[j, i, n] += perc50
      vals95[j, i, n] += perc95


print(vals5.argmax())
print(vals50.argmax())
print(vals95.argmax())

avg5 = vals5.mean(axis=2)
avg50 = vals50.mean(axis=2)
avg95 = vals95.mean(axis=2)

print(avg5)
print(avg50)
print(avg95)

# alloc_frac = np.linspace(0, 0.20, 41)
# ins_cost0 = 8.62
# ins_cost = np.linspace(0.5, 1, 51)
# N = 20
# vals5 = np.zeros((len(alloc_frac), len(ins_cost), N))
# vals50 = vals5.copy()
# vals95 = vals5.copy()

# for n in range(N):
#     for i, c in enumerate(ins_cost):
#         payoffs = [ins_cost0 * c, ins_cost0 * c * 0.5, ins_cost0 * c * 0.25, 0, 0, ins_cost0 * c * 0.25, ins_cost0 * c * 0.5, ins_cost0 * c]
#         for j, f in enumerate(alloc_frac):
#             traj = bitcoinSim(df_annual, allocation=f, payoffs=payoffs)
#             perc5, _ = getQuantilePath(traj, 0.05)
#             perc50, _ = getQuantilePath(traj, 0.5)
#             perc95, _ = getQuantilePath(traj, 0.95)

#             vals5[j, i, n] += perc5
#             vals50[j, i, n] += perc50
#             vals95[j, i, n] += perc95

# avg5 = vals5.mean(axis=2)
# avg50 = vals50.mean(axis=2)
# avg95 = vals95.mean(axis=2)

# plt.figure(figsize=(12, 8))
# plt.plot(ins_cost * ins_cost0, avg5.max(axis=0), label='5th Percentile')
# plt.plot(ins_cost * ins_cost0, avg50.max(axis=0), label='50th Percentile')
# plt.plot(ins_cost * ins_cost0, avg95.max(axis=0), label='95th Percentile')
# plt.axhline(y=avg50[0, 0], color='k', linestyle='--', label='Unhedged CAGR')
# plt.axvline(x=6.8, color='r', linestyle='--', label='Break-even point')
# plt.xlabel('Insurance Payoff (%)')
# plt.ylabel('CAGR (%)')
# plt.title('Cost-Effective Insurance Boundary for Bitcoin')
# plt.legend()
# plt.grid(True)
# plt.show()

# # Bitcoin Options Analysis
# current_price = df['Close'].iloc[-1]
# strike_price = current_price * 0.85  # 15% OTM put
# time_to_expiry = 1.0  # 1 year
# risk_free_rate = 0.02  # Assuming 2% risk-free rate
# volatility = df['returns'].std() * np.sqrt(252)  # Annualized volatility

# def calculate_option_metrics(S, K, T, r, sigma, option_type):
#     price = bs(option_type, S, K, T, r, sigma)
#     option_delta = delta(option_type, S, K, T, r, sigma)
#     option_gamma = gamma(option_type, S, K, T, r, sigma)
#     option_vega = vega(option_type, S, K, T, r, sigma)
#     option_theta = theta(option_type, S, K, T, r, sigma)
#     option_rho = rho(option_type, S, K, T, r, sigma)
#     return price, option_delta, option_gamma, option_vega, option_theta, option_rho

# put_price, put_delta, put_gamma, put_vega, put_theta, put_rho = calculate_option_metrics(
#     current_price, strike_price, time_to_expiry, risk_free_rate, volatility, 'p')

# print(f"Bitcoin Put Option Analysis:")
# print(f"Current Bitcoin Price: ${current_price:.2f}")
# print(f"Strike Price: ${strike_price:.2f}")
# print(f"Option Price: ${put_price:.2f}")
# print(f"Delta: {put_delta:.4f}")
# print(f"Gamma: {put_gamma:.4f}")
# print(f"Vega: {put_vega:.4f}")
# print(f"Theta: {put_theta:.4f}")
# print(f"Rho: {put_rho:.4f}")

# # Plot 6: Option payoff profiles
# def plot_option_payoff(option_type, strike_price, premium):
#     stock_prices = np.linspace(0.5 * strike_price, 1.5 * strike_price, 100)
#     if option_type == 'call':
#         payoff = np.maximum(stock_prices - strike_price, 0) - premium
#     else:  # put
#         payoff = np.maximum(strike_price - stock_prices, 0) - premium
    
#     plt.figure(figsize=(10, 6))
#     plt.plot(stock_prices, payoff)
#     plt.axhline(y=0, color='r', linestyle='--')
#     plt.axvline(x=strike_price, color='g', linestyle='--')
#     plt.xlabel('Bitcoin Price')
#     plt.ylabel('Profit/Loss')
#     plt.title(f'{option_type.capitalize()} Option Payoff for Bitcoin')
#     plt.grid(True)
#     plt.show()

# # Plot put option payoff
# plot_option_payoff('put', strike_price, put_price)

# # Calculate efficient price
# eff = 6.8
# efficient_price = calcEfficientPrice(strike_price, current_price * 0.85, eff)

# print(f"\nEfficient Price Analysis:")
# print(f"Efficient Price: ${efficient_price:.2f}")
# print(f"Actual Option Price: ${put_price:.2f}")
# if put_price <= efficient_price:
#     print("The option is cost-effective as a safe haven.")
# else:
#     print("The option is not cost-effective as a safe haven.")