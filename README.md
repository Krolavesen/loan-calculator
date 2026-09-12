# Loan Calculator

A loan calculator that estimates monthly expenses for each month over a loan payment schedule.

## Features

### General


* Calculates monthly interest rate from nominal rate and length of payment schedule.
* Calculates loan amount based on:

  * Total purchase price of the property
  * Total equity and number borrowers
* Toggleable metrics:

  * Customer dividend
  * Tax deduction
  * Interest-rate stress testing
* Calculates the eligible loan amount based on income and equity*.

### Annuity

Calculates the projected monthly payment of a loan based on:

* Monthly interest rate
* Loan amount
* Length of the payment schedule

### Customer Dividend

Calculates projected customer dividend for each month over the payment schedule based on:

* Outstanding loan balance , including the initial balance at month zero
* Number of borrowers
* Loan and loan limit per borrower
* Deposit and deposit limit per borrower during the previous calendar year
* Dividend rate

### Tax Deduction

Calculates the projected tax deduction for each month over a payment schedule based on:

* Projected interest payment
* Tax deduction rate

### Monthly Expenses

Calculates the projected monthly expenses for each month over the payment schedule based on:

* Projected outstanding loan balance
* Projected interest payment
* Projected customer dividend
* Projected tax deduction
* Monthly joint property expenses

## Web app

A React frontend lives in [`web/`](web/) — Vite 8, React 19 with the Rust React
Compiler, Base UI components, hosted on Vercel.

The frontend does no arithmetic of its own. Every figure comes from the modules
in this directory, called through [`api/schedule.py`](api/schedule.py), a Vercel
Python Function:

```
web/  ──POST /api/schedule──>  api/schedule.py  ──>  loan_calculator.py
                                                     config.py
```

### Running it locally

```sh
python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python scripts/dev_api.py     # the same handler Vercel runs, on :8000
cd web && npm install && npm run dev    # :5173, proxies /api to :8000
```

### Tests

```sh
.venv/bin/python -m unittest discover -s tests
```

## Configuration

* See **config.py** to adjust settings. The web app reads the same defaults over
  `GET /api/schedule` and lets you override them per projection.

## Known Issues

* Customer dividend is a conservative estimate.
* *Not implemented yet. Interest-rate stress testing is available in the web app
  as a toggle that re-runs the projection at a raised nominal rate.
