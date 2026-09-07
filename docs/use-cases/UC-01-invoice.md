# Use Cases — Quick Invoice System

## Overview Diagram

```mermaid
graph LR
    Owner((Owner))
    Owner --> UC1[UC-01: Create Invoice]
    Owner --> UC2[UC-02: Manage Products]
    UC1 -. "product not found" .-> UC2
```

---

## UC-01: Create Invoice

**Actor:** Owner
**Precondition:** The system has at least one active product in the database

### Main flow
1. Open the "Create Invoice" screen (new invoice, status = `draft`)
2. Type the product name into the input field
3. The system performs a fuzzy search and displays a dropdown of matching products
4. Select a product (↑↓ + Enter, or click)
5. The system checks the number of units:
    - 1 unit → auto-fill the unit and price
    - >1 unit → select a unit → fill in the corresponding price
6. Enter the quantity → the system calculates the line total = price × quantity
7. Add the line item to the invoice table
8. The system automatically saves the draft to the database after each semantic change
9. Repeat steps 2–8 for other products
10. The system calculates the total amount
11. Click "Complete" → status changes from `draft` to `completed`
12. Click "Print" → send the invoice to the printer

### Alternate flow
- **A1 (VIP price):** Manually edit the price in steps 5/6 if the customer is a VIP
- **A2 (Edit a completed invoice):** Reopen a `completed` invoice → edit it → the system displays a confirmation dialog → if confirmed, the new data overwrites the old data

### Exception flow
- **E1:** No matching product is found → display a notification and suggest using UC-02 to add a new product
- **E2:** A line item is deleted by mistake → provide a delete-line button with undo support
- **E3:** The app closes unexpectedly → the draft data has already been saved automatically and will be restored when the app is reopened

### Flow diagram

```mermaid
flowchart TD
    A[Open the Create Invoice screen] --> B[Type the product name]
    B --> C{Fuzzy search<br/>returns results?}
    C -- No --> C1[Display not-found notification]
    C1 --> C2[Go to UC-02:<br/>Manage Products]
    C -- Yes --> D[Display suggestion dropdown]
    D --> E[Select a product]
    E --> F{Does the product have<br/>more than 1 unit?}
    F -- Yes --> F1[Select a unit]
    F1 --> G[Auto-fill the price for the unit]
    F -- No --> G
    G --> G1{Is the customer a VIP?}
    G1 -- Yes --> G2[Edit the discounted price]
    G1 -- No --> H
    G2 --> H[Enter the quantity]
    H --> I[Calculate line total = price x quantity]
    I --> J[Add the line item to the invoice]
    J --> K[Debounced auto-save of the draft]
    K --> L{Add another product?}
    L -- Yes --> B
    L -- No --> M[Calculate the total amount]
    M --> N[Click Complete]
    N --> O[Status: draft -> completed]
    O --> P[Print the invoice]
```

---