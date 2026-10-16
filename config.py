# Annuitetslån oppdaterer renter årlig.
# Sriv i known issues: antar konstant nominell
# rente gjennom hele løper.
 

# Configure max deposit.
MAX_DEPOSIT = 2e6

# Configure max loan per borrower.
MAX_LOAN_PER_BORROWER = 2e6

# Configure dividend rate.
DIVIDEND_RATE = 0.0035

# Configure tax deduction rate.
DEDUCTION_RATE = 0.22

# Configure lower and upper quantile of the projected nominal rate in 2027/28.
LOWER_QUANTILE_RATE = 0.0225
UPPER_QUANTILE_RATE = 0.0375

# Income tax on wages, 2026 rates. Verify against skatteetaten.no before
# relying on the net pay estimate.
# Trygdeavgift on wages.
SOCIAL_SECURITY_RATE = 0.076
# Minstefradrag: share of the salary, up to a cap in NOK.
MINIMUM_DEDUCTION_RATE = 0.46
MINIMUM_DEDUCTION_CAP = 95_700
# Personfradrag in NOK.
PERSONAL_ALLOWANCE = 114_540
# Trinnskatt: (threshold in NOK, rate on the salary above it, up to the
# next threshold).
STEP_TAX_BRACKETS = [
    (226_100, 0.017),
    (318_300, 0.040),
    (725_050, 0.137),
    (980_100, 0.168),
    (1_467_200, 0.178),
]

# Tabelltrekk withholds the year's tax over 10.5 months: June is trekkfri
# and December is withheld at half.
WITHHOLDING_MONTHS = 10.5
