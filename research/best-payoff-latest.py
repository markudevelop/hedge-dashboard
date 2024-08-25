import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from scipy.stats import norm
import requests
from datetime import datetime

# Function to fetch options data from Deribit API
def fetch_deribit_data(currency="BTC"):
    url = f"https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency={currency}&kind=option"
    try:
        response = requests.get(url)
        response.raise_for_status()  # Raise an error for bad status codes
        data = response.json()
        if 'result' in data:
            put_options = [
                {
                    'strike': float(option['instrument_name'].split('-')[-2]),
                    'iv': option['mark_iv'] / 100,
                    'marketPrice': option['ask_price'] * option['underlying_price'],  # If we want to buy right now use the ASK
                    # 'marketPrice': ((option['bid_price'] + option['ask_price']) / 2) * option['underlying_price'],  # If want to catch the mid price
                    # 'marketPrice': (0.001 if option['bid_price'] is None else option['bid_price']) * option['underlying_price'],  # If we want to catch the bid_price wait for long time
                    'underlying_price': option['underlying_price'],
                    'instrument_name': option['instrument_name']
                }
                for option in data['result']
                if '-P' in option['instrument_name']  # Only consider put options
                and option['mark_price'] > 0  # Ensure the market price is greater than zera
                and option['underlying_price'] > 0
                and float(option['instrument_name'].split('-')[-2]) <  option['underlying_price']
                # and option['bid_price'] != None and option['bid_price'] > 0
                and option['ask_price'] != None and option['ask_price'] > 0
                and (datetime.strptime(option['instrument_name'].split('-')[1], "%d%b%y") - datetime.now()).days >= 30
            ]
            return put_options
        else:
            print("Error: No result found in API response.")
            return []
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data from Deribit API: {e}")
        return []

# Fetch data from the API
options = fetch_deribit_data()

# If no data was fetched, exit the script
if not options:
    print("No options data fetched. Exiting script.")
    exit()

for option in options:
    if option['marketPrice'] < 1:
        print("WTF", option)
        exit()

# Fixed variables
riskFreeRate = 0.05
timeToMaturity = 36 / 365
budget = 1000  # $4,000 budget

# Black-Scholes function for put option pricing
def calculate_put_price(S, K, T, r, sigma):
    d1 = (np.log(S / K) + (r + sigma ** 2 / 2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)
    put_price = K * np.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
    return put_price

# Define price drops and IV increases
price_drops = [-0.10, -0.20, -0.30, -0.4]
iv_increases = [0.00, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.8, 1]

# Initialize payoff matrix and strike matrix
payoff_matrix = np.zeros((len(price_drops), len(iv_increases)))
strike_matrix = np.zeros((len(price_drops), len(iv_increases)))

# Variables to store the best overall result
best_overall_payoff = -np.inf
best_overall_details = {}

# Dictionary to store best strikes with corresponding conditions
best_strikes = {}

# Calculate payoffs and best strikes considering the budget
for i, drop in enumerate(price_drops):
    for j, iv_increase in enumerate(iv_increases):
        best_payoff = -np.inf
        best_strike = None
        best_strike_details = None
        
        for option in options:
            new_price = option['underlying_price'] * (1 + drop)
            new_iv = option['iv'] * (1 + iv_increase)
            new_option_price = calculate_put_price(new_price, option['strike'], timeToMaturity, riskFreeRate, new_iv)
            payoff = (new_option_price - option['marketPrice']) / option['marketPrice']
            
            # Calculate the number of contracts you can buy
            num_contracts = budget // option['marketPrice']
            total_payoff = payoff * num_contracts
            
            if total_payoff > best_payoff:
                best_payoff = total_payoff
                best_strike = option['strike']
                best_strike_details = option
                best_strike_details['num_contracts'] = num_contracts
                # Store details of this scenario
                details = {
                    'drop': drop,
                    'iv_increase': iv_increase,
                    'strike': option['strike'],
                    'instrument_name': option['instrument_name'],
                    'market_price': option['marketPrice'],
                    'new_option_price': new_option_price,
                    'num_contracts': num_contracts,
                    'total_payoff': num_contracts * new_option_price,
                    'amount_spent': num_contracts * option['marketPrice'],
                    'payoff': payoff
                }
        
        payoff_matrix[i, j] = best_payoff
        strike_matrix[i, j] = best_strike

        # Store the strike with the corresponding price drop and IV increase
        if best_strike not in best_strikes:
            best_strikes[best_strike] = []
        best_strikes[best_strike].append({
            'price_drop': drop,
            'iv_increase': iv_increase,
            'payoff': best_payoff,
            'instrument_name': best_strike_details['instrument_name'],
            'num_contracts': best_strike_details['num_contracts']
        })

        # Check if this is the best overall result
        if best_payoff > best_overall_payoff:
            best_overall_payoff = best_payoff
            best_overall_details = details

# Console log the best overall details
if best_overall_details:
    print(f"Best Overall Scenario:")
    print(f"  Price Drop: {best_overall_details['drop']*100}%")
    print(f"  IV Increase: {best_overall_details['iv_increase']*100}%")
    print(f"  Strike Price: {best_overall_details['strike']}")
    print(f"  instrument_name: {best_overall_details['instrument_name']}")
    print(f"  Market Price per Option: ${best_overall_details['market_price']:.2f}")
    print(f"  New Option Price after Drop: ${best_overall_details['new_option_price']:.2f}")
    print(f"  Number of Contracts: {best_overall_details['num_contracts']}")
    print(f"  Total Amount Spent: ${best_overall_details['amount_spent']:.2f}")
    print(f"  Expected Total Payoff: ${best_overall_details['total_payoff']:.2f}")
    print(f"  Expected Payoff: x{best_overall_details['payoff']:.2f}")

# Console log all the best strike prices with their conditions
for strike, details in best_strikes.items():
    print(f"Strike Price: {strike}")
    for detail in details:
        print(f"  Price Drop: {detail['price_drop']*100}%, IV Increase: {detail['iv_increase']*100}%, Payoff: {detail['payoff']:.2f}, Name: {detail['instrument_name']}, num_contracts: {detail['num_contracts']}")


# Create a figure with two subplots
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 16))

# Plot the payoff heatmap
sns.heatmap(payoff_matrix, annot=True, fmt=".2f", cmap="YlGnBu", 
            xticklabels=[f"{iv*100:.0f}%" for iv in iv_increases], 
            yticklabels=[f"{-drop*100:.0f}%" for drop in price_drops], ax=ax1)
ax1.set_title("Best Total Payoff Based on Price Drop and IV Increase")
ax1.set_xlabel("IV Increase")
ax1.set_ylabel("Price Drop")

# Plot the strike price heatmap
sns.heatmap(strike_matrix, annot=True, fmt=".0f", cmap="YlOrRd", 
            xticklabels=[f"{iv*100:.0f}%" for iv in iv_increases], 
            yticklabels=[f"{-drop*100:.0f}%" for drop in price_drops], ax=ax2)
ax2.set_title("Best Strike Price Based on Price Drop and IV Increase")
ax2.set_xlabel("IV Increase")
ax2.set_ylabel("Price Drop")

print(strike_matrix)

plt.tight_layout()
plt.show()
