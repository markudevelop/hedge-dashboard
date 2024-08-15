import numpy as np
import pandas as pd
import yfinance as yf
import matplotlib.pyplot as plt

# Set the random seed for reproducibility
np.random.seed(1234)

# Fetch Bitcoin historical data from Yahoo Finance
btc_data = yf.download('BTC-USD', start='2013-01-01', end=pd.to_datetime("today"), interval='1mo')

# Keep only the 'Date' and 'Adj Close' columns
btc_data.reset_index(inplace=True)
btc_data = btc_data[['Date', 'Adj Close']].copy()
btc_data.columns = ['date', 'adj_close']

# Calculate monthly returns
btc_data['returns'] = btc_data['adj_close'].pct_change()
btc_data['log_returns'] = np.log(1 + btc_data['returns'])

# Calculate annual returns from monthly log returns
btc_data['annual_returns'] = np.exp(btc_data['log_returns'].rolling(12).sum()) - 1

# Extract the year directly from the 'date' column which is of Timestamp type
btc_data['year'] = btc_data['date'].dt.year

# Reduce to a specific period if needed (in this example, we'll use 2013-2023 for Bitcoin)
btc_rets = btc_data.loc[(btc_data['year'] >= 1), ['date', 'year', 'annual_returns']].copy()
# Remove initial NaN values caused by the rolling window
btc_rets.dropna(subset=['annual_returns'], inplace=True)

print(btc_rets)
# Reset index and drop the old index
btc_rets.reset_index(drop=True, inplace=True)

# Display the first few rows of the processed DataFrame
print(btc_rets['date'].min(), btc_rets['date'].max()) # 108 total 

# Add bin mapping to match Spitznagel's groupings
bins = [-np.inf, -0.5, -0.3, -0.15, 0, 0.15, 0.3, 0.5, np.inf]
categories = list(range(len(bins) - 1))
labels = ['<-50%', '-50% to -30%', '-30% to -15%', '-15% to 0%', '0% to 15%', '15% to 30%', '30% to 50%', '>50%']

# Categorize the annual returns into the defined bins
cats = pd.cut(btc_rets['annual_returns'], bins, labels=categories, include_lowest=True)
labs = pd.cut(btc_rets['annual_returns'], bins, labels=labels, include_lowest=True)

# Combine the original DataFrame with the new categorical data
df_agg = pd.concat([btc_rets, cats, labs], axis=1)
df_agg.columns = ['date', 'year', 'annual_returns', 'category', 'label']  # Rename columns
df_agg.dropna(subset=['category'], inplace=True)  # Drop any NaN category rows
df_agg['category'] = df_agg['category'].astype(int)  # Ensure the category column is of integer type

# Plot the results
colors = plt.rcParams['axes.prop_cycle'].by_key()['color']  # Get the default color cycle
fig, ax = plt.subplots(figsize=(12, 8))

# Plot a bar chart of the frequency of each return category
ax.bar(categories,
       df_agg['category'].value_counts().sort_index(),
       color=colors[1])

# Set the x-axis labels and ticks
ax.set_xticks(categories)
ax.set_xticklabels(labels)

# Add labels and title
plt.xlabel('Annual Bitcoin Return (%)')
plt.ylabel('Frequency')
plt.title('Annual Bitcoin Returns from 2013-2023')
plt.xticks(rotation=45)

# Adjust the layout to fit everything nicely
plt.tight_layout()
plt.show()

# Show the plot
category_counts = df_agg['category'].value_counts().sort_index()
for category, label in zip(category_counts.index, labels):
    print(f"Category '{label}': {category_counts[category]} occurrences")


# Calculate the total break even payoff for insurance is:
# Take how many months e.g. 8 years (2015-2023) 8 * 12 + 2 (2015 is just 2 months)
# 108 and then we take category divide by total 
# so occurence / 108 (months)
# 20 / 108 = 0.1851851852 or 18.5%...
# get inverse of that 1 / 0.1851851852 - 100 (total loss)= 439.9999999568

def getQuantilePath(trajectories: np.array, q: float=0.5):
  quantile = np.quantile(trajectories[:, -1], q=q)
  path = trajectories[np.abs(quantile - trajectories[:, -1]).argmin()]
  return quantile, path

def bitcoinSim(data: pd.DataFrame, allocation: float=0, 
               payoffs: list=[5.39, 0, 0, 0, 0], 
               years: int=25, samples: int=10000):
    # Convert payoffs to a NumPy array
    payoffs = np.asarray(payoffs)

    # Get the number of available indices
    available_indices = data.index.size

    # Simulate indices to select random samples of 'years' length
    sims = np.random.choice(available_indices, size=(samples, years), replace=True)

    # Extract return categories based on the simulated indices
    ret_cats = data['category'].values[sims]

    # Calculate risk returns based on the allocation
    risk_rets = (1 - allocation) * (data['annual_returns'].values[sims] + 1)

    # Calculate safe haven returns based on the allocated amount and payoffs
    safe_haven_rets = allocation * payoffs[ret_cats]

    # Calculate the cumulative product of combined returns across the simulation period
    return np.cumprod(risk_rets + safe_haven_rets, axis=1)

# Example usage with the df_agg DataFrame
n_traj = bitcoinSim(df_agg, allocation=0)

colors = plt.rcParams['axes.prop_cycle'].by_key()['color']

perc50, path50 = getQuantilePath(n_traj)
perc95, path95 = getQuantilePath(n_traj, q=0.95)
perc5, path5 = getQuantilePath(n_traj, q=0.05)
path_avg = n_traj.mean(axis=0)


fig = plt.figure(figsize=(15, 8))
gs = fig.add_gridspec(1, 2, width_ratios=(3, 1))
ax = fig.add_subplot(gs[0])
ax_hist = fig.add_subplot(gs[1])

ax.plot(path50, label='Median')
ax.plot(path95, label=r'$95^{th}$ Percentile')
ax.plot(path5, label=r'$5^{th}$ Percentile')
ax.plot(path_avg, label='Mean', linestyle=':')
ax.fill_between(np.arange(n_traj.shape[1]), 
                 y1=n_traj.min(axis=0),
                 y2=n_traj.max(axis=0),
                 alpha=0.3, color=colors[4])
ax.set_title('Simulated Bitcoin from all years')
ax.set_xlabel('Years')
ax.set_ylabel('Ending Wealth')
ax.semilogy()
ax.legend(loc=3)

growth = (np.power(n_traj[:, -1], 1/300) - 1) * 100
growth_med = (np.power(path50[-1], 1/300) -1) * 100
growth_avg = (np.power(path_avg[-1], 1/300) - 1) * 100
ax_hist.hist(growth, orientation='horizontal', bins=50, 
  color=colors[4], alpha=0.3)
ax_hist.axhline(0, label='Break Even', color='k', linestyle=':')
ax_hist.axhline(growth_med, label='Median', color=colors[0])
ax_hist.axhline(growth_avg, label='Mean', color=colors[3])
ax_hist.set_ylabel('Compound Growth Rate (%)')
ax_hist.set_xlabel('Frequency')
ax_hist.legend()

plt.tight_layout()


# run brute force
# Assuming bitcoinSim is the function defined earlier and getQuantilePath is available
alloc_frac = np.linspace(0, 0.20, 101)
N = 10

# Initialize arrays to store results for each quantile
vals5 = np.zeros((len(alloc_frac), N))
vals50 = vals5.copy()
vals95 = vals5.copy()

# Loop over each simulation run
for i in range(N):
    for j, f in enumerate(alloc_frac):
        # Run the simulation with the current allocation fraction
        traj = bitcoinSim(df_agg, allocation=f)

        # Compute the 5th, 50th (median), and 95th percentile paths
        perc5, _ = getQuantilePath(traj, 0.05)
        perc50, _ = getQuantilePath(traj, 0.5)
        perc95, _ = getQuantilePath(traj, 0.95)

        # Accumulate the results
        vals5[j, i] += perc5
        vals50[j, i] += perc50
        vals95[j, i] += perc95

# Average our sample medians to smooth out the plot
smooth5 = vals5.mean(axis=1)
smooth50 = vals50.mean(axis=1)
smooth95 = vals95.mean(axis=1)

# Now smooth5, smooth50, and smooth95 contain the smoothed paths for each quantile
# Plot the results
# plt.figure(figsize=(12, 8))
# plt.plot(smooth5, label=r'$5^{th}$ Percentile')
# plt.plot(smooth50, label=r'$50^{th}$ Percentile')
# plt.plot(smooth95, label=r'$95^{th}$ Percentile')
# plt.scatter(smooth5.argmax(), smooth5.max(), marker='*', s=200)
# plt.scatter(smooth50.argmax(), smooth50.max(), marker='*', s=200)
# plt.scatter(smooth95.argmax(), smooth95.max(), marker='*', s=200)
# plt.xlabel('Percentage of Wealth Allocated')
# plt.ylabel('Ending Wealth')
# plt.title('Optimal Insurance Allocation')
# plt.semilogy()  # Logarithmic scale on the y-axis
# plt.legend()

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

peak5_index = smooth5.argmax()
peak5_value = smooth5.max()
peak5_x = alloc_frac[peak5_index]

peak50_index = smooth50.argmax()
peak50_value = smooth50.max()
peak50_x = alloc_frac[peak50_index]

peak95_index = smooth95.argmax()
peak95_value = smooth95.max()
peak95_x = alloc_frac[peak95_index]

# Log the peak values to the console along with their corresponding x-values
print(f"5th Percentile Peak: Index={peak5_index}, X={peak5_x}, Value={peak5_value}")
print(f"50th Percentile Peak: Index={peak50_index}, X={peak50_x}, Value={peak50_value}")
print(f"95th Percentile Peak: Index={peak95_index}, X={peak95_x}, Value={peak95_value}")

# Caclulate optimal value and use it 0.136
n_traj2 = bitcoinSim(df_agg, allocation=0.035)

colors = plt.rcParams['axes.prop_cycle'].by_key()['color']

perc50, path50 = getQuantilePath(n_traj2)
perc95, path95 = getQuantilePath(n_traj2, q=0.95)
perc5, path5 = getQuantilePath(n_traj2, q=0.05)
path_avg = n_traj2.mean(axis=0)


fig = plt.figure(figsize=(15, 8))
gs = fig.add_gridspec(1, 2, width_ratios=(3, 1))
ax = fig.add_subplot(gs[0])
ax_hist = fig.add_subplot(gs[1])

ax.plot(path50, label='Median')
ax.plot(path95, label=r'$95^{th}$ Percentile')
ax.plot(path5, label=r'$5^{th}$ Percentile')
ax.plot(path_avg, label='Mean', linestyle=':')
ax.fill_between(np.arange(n_traj2.shape[1]), 
                 y1=n_traj2.min(axis=0),
                 y2=n_traj2.max(axis=0),
                 alpha=0.3, color=colors[4])
ax.set_title('Simulated Bitcoin from all years optimized')
ax.set_xlabel('Years')
ax.set_ylabel('Ending Wealth')
ax.semilogy()
ax.legend(loc=3)

growth = (np.power(n_traj2[:, -1], 1/300) - 1) * 100
growth_med = (np.power(path50[-1], 1/300) -1) * 100
growth_avg = (np.power(path_avg[-1], 1/300) - 1) * 100
ax_hist.hist(growth, orientation='horizontal', bins=50, 
  color=colors[4], alpha=0.3)
ax_hist.axhline(0, label='Break Even', color='k', linestyle=':')
ax_hist.axhline(growth_med, label='Median', color=colors[0])
ax_hist.axhline(growth_avg, label='Mean', color=colors[3])
ax_hist.set_ylabel('Compound Growth Rate (%)')
ax_hist.set_xlabel('Frequency')
ax_hist.legend()

plt.tight_layout()


# Define the parameters
alloc_frac = np.linspace(0, 0.20, 41)
ins_cost0 = 5.39
ins_cost = np.linspace(0.5, 1, 51)
N = 20  # Multiple runs to smooth out results

# Initialize arrays to store results
vals5 = np.zeros((len(alloc_frac), len(ins_cost), N))
vals50 = np.zeros_like(vals5)

# Run the simulation
for n in range(N):
    for i, c in enumerate(ins_cost):
        payoffs = [ins_cost0 * c, 0, 0, 0, 0]
        for j, f in enumerate(alloc_frac):
            traj = bitcoinSim(df_agg, allocation=f, payoffs=payoffs)
            perc5, _ = getQuantilePath(traj, 0.05)
            perc50, _ = getQuantilePath(traj, 0.5)

            vals5[j, i, n] += perc5
            vals50[j, i, n] += perc50

# Average across the N runs to smooth out results
avg_vals5 = vals5.mean(axis=2)
avg_vals50 = vals50.mean(axis=2)

# Plot for the 50th Percentile
plt.figure(figsize=(14, 6))
contour50 = plt.contour(ins_cost0 * ins_cost, alloc_frac * 100, avg_vals50, levels=20, cmap='cool')
plt.clabel(contour50, inline=True, fontsize=10, fmt='%1.1f%%')
plt.plot(ins_cost0 * ins_cost, avg_vals50[0, :], 'r', label='Optimal Allocation')
plt.axhline(0, color='k', linestyle=':')
plt.axvline(680, color='orange', linestyle=':')
plt.title('CAGR for 50th Percentile Case as a Function of Payoff and Allocation')
plt.xlabel('Insurance Payoff (%)')
plt.ylabel('CAGR (%)')
plt.legend()

# Plot for the 5th Percentile
plt.figure(figsize=(14, 6))
contour5 = plt.contour(ins_cost0 * ins_cost, alloc_frac * 100, avg_vals5, levels=20, cmap='cool')
plt.clabel(contour5, inline=True, fontsize=10, fmt='%1.1f%%')
plt.plot(ins_cost0 * ins_cost, avg_vals5[0, :], 'r', label='Optimal Allocation')
plt.axhline(0, color='k', linestyle=':')
plt.axvline(680, color='orange', linestyle=':')
plt.title('CAGR for 5th Percentile Case as a Function of Payoff and Allocation')
plt.xlabel('Insurance Payoff (%)')
plt.ylabel('CAGR (%)')
plt.legend()

plt.show()