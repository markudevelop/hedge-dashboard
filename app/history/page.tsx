"use client"

import React, { useState } from 'react';

type Trade = {
  id: number;
  date: string;
  instrument: string;
  type: 'Buy' | 'Sell';
  quantity: number;
  price: number;
};

const OptionsProfitCalculator: React.FC = () => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [formData, setFormData] = useState<Omit<Trade, 'id'>>({
    date: '',
    instrument: '',
    type: 'Buy',
    quantity: 0,
    price: 0,
  });

  const [totalProfit, setTotalProfit] = useState(0);

  const addTrade = () => {
    const newTrade: Trade = {
      id: trades.length + 1,
      ...formData,
    };

    setTrades([...trades, newTrade]);
    calculateTotalProfit([...trades, newTrade]);
    // Reset form
    setFormData({
      date: '',
      instrument: '',
      type: 'Buy',
      quantity: 0,
      price: 0,
    });
  };

  const calculateTotalProfit = (tradesList: Trade[]) => {
    let profit = 0;
    tradesList.forEach((trade) => {
      const tradeProfit = trade.quantity * trade.price * (trade.type === 'Buy' ? -1 : 1);
      profit += tradeProfit;
    });
    setTotalProfit(profit);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h2 className="text-2xl font-bold mb-4">Options Profit Calculator</h2>
      <div className="bg-white p-4 rounded shadow-md mb-8">
        <h3 className="text-xl font-semibold mb-4">Add New Trade</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Date */}
          <div>
            <label className="block text-gray-700">Date</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full p-2 border rounded"
            />
          </div>
          {/* Instrument */}
          <div>
            <label className="block text-gray-700">Instrument</label>
            <input
              type="text"
              value={formData.instrument}
              onChange={(e) => setFormData({ ...formData, instrument: e.target.value })}
              className="w-full p-2 border rounded"
            />
          </div>
          {/* Type */}
          <div>
            <label className="block text-gray-700">Type</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as 'Buy' | 'Sell' })}
              className="w-full p-2 border rounded"
            >
              <option value="Buy">Buy</option>
              <option value="Sell">Sell</option>
            </select>
          </div>
          {/* Quantity */}
          <div>
            <label className="block text-gray-700">Quantity</label>
            <input
              type="number"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
              className="w-full p-2 border rounded"
            />
          </div>
          {/* Price */}
          <div>
            <label className="block text-gray-700">Price</label>
            <input
              type="number"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
              className="w-full p-2 border rounded"
            />
          </div>
        </div>
        <button
          onClick={addTrade}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
        >
          Add Trade
        </button>
      </div>

      {/* Trades Table */}
      <div className="bg-white p-4 rounded shadow-md">
        <h3 className="text-xl font-semibold mb-4">Trades List</h3>
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="border px-4 py-2">Date</th>
              <th className="border px-4 py-2">Instrument</th>
              <th className="border px-4 py-2">Type</th>
              <th className="border px-4 py-2">Quantity</th>
              <th className="border px-4 py-2">Price</th>
              <th className="border px-4 py-2">Profit/Loss</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id}>
                <td className="border px-4 py-2">{trade.date}</td>
                <td className="border px-4 py-2">{trade.instrument}</td>
                <td className="border px-4 py-2">{trade.type}</td>
                <td className="border px-4 py-2">{trade.quantity}</td>
                <td className="border px-4 py-2">${trade.price.toFixed(2)}</td>
                <td className="border px-4 py-2">
                  ${(
                    trade.quantity *
                    trade.price *
                    (trade.type === 'Buy' ? -1 : 1)
                  ).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Total Profit */}
        <div className="mt-4 text-xl font-bold">
          Total Profit/Loss: ${totalProfit.toFixed(2)}
        </div>
      </div>
    </div>
  );
};

export default OptionsProfitCalculator;
