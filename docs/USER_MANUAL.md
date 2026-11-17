# EatMe User Manual

**CSE 403 · Group 4 · Autumn 2026**

EatMe is a web application for organizing groceries, keeping track of expiration dates, and checking which ingredients you have available for recipes.

This guide explains how to access EatMe and use its current features. For detailed developer setup, database configuration, and testing instructions, see the [README](../README.md).

> **Note:** EatMe is still under development. A public production website is not currently documented, and using the application requires a running frontend, backend, and database.

## 1. Getting Started

### Access EatMe

If the team has provided a running EatMe web address, open it in your browser.

To run EatMe locally, you will need Git, Node.js 22 or newer, Go 1.26 or newer, and access to a PostgreSQL database configured for EatMe.

1. Clone the repository:

   ```bash
   git clone https://github.com/erenlin/EatMe.git
   cd EatMe
   ```

2. Obtain approved database connection details from the database owner. Follow the [README](../README.md) to configure the backend environment variables, including `JWT_SECRET`, `DATABASE_URL`, and `PGPASSWORD`. Do not put credentials in source files or commit them to GitHub.

3. In a terminal, open the backend folder and start the server after configuring those variables:

   ```bash
   cd backend
   go mod download
   go run ./cmd/server
   ```

4. In a second terminal, starting from the repository root, run:

   ```bash
   cd frontend
   npm ci
   npm run dev
   ```

5. Open the address displayed by the frontend development server, normally `http://localhost:5173`. The backend normally runs at `http://localhost:8080`.

Keep both servers running while using the application. If you do not have the required database access, contact the team before attempting local setup.

### Create an Account

1. On the login screen, click **Create an account**.
2. Enter your first name, last name, email address, password, password confirmation, date of birth, and gender.
3. Your password must contain at least **8 characters**.
4. Click **Create account**.

EatMe attempts to sign you in automatically after creating your account. If automatic login fails, return to the login screen and sign in using your new credentials.

### Log In

1. Enter your email address and password.
2. Click **Log in**.
3. After signing in, you will arrive at the **Groceries** page.

If registration or login fails, check the error message displayed on the screen. If running locally, make sure the backend and database are available.

## 2. Understanding Groceries and Saved Foods

EatMe separates the groceries you currently own from the foods you have saved for future use.

- **Groceries:** Your personal inventory, including quantities and expiration information.
- **Saved foods:** A collection of foods and their types that you can reuse when adding groceries. Access it through **Settings → Saved foods**.
- **Food:** A general food category, such as Apple.
- **Type (variant):** A specific kind of food, such as Fuji or Gala.
- **Grocery entry:** A quantity of a food type that you currently have in your inventory.

For example, saving Apple and its Fuji type does not automatically add Fuji apples to your inventory. You must also record how many you purchased.

**Tip:** To record groceries you purchased, start with **Groceries → + Add**. You do not need to create entries in Saved foods first.

## 3. Adding Groceries

### Add a Previously Saved Food

1. Open **Groceries**.
2. Click **+ Add**.
3. Use the search field to find a food or type you previously saved.
4. Enter how many you purchased in the **How many** field.
5. Click **Add** next to that food.

You can enter a whole-number quantity from 1 to 999.

After a successful addition, EatMe displays a confirmation message and returns you to Groceries.

### Add a New Food

If the food you purchased has not been saved before:

1. Open **Groceries → + Add**.
2. Click **Add a food you haven't bought before**. If your search has no matches, the button instead offers to add the searched food by name.
3. Under **New food**, enter the food's name, such as Peach.
4. Optionally, enter a type, such as Yellow or Organic. If left blank, the type defaults to Regular.
5. Select the size of one item: **Small**, **Medium**, or **Large**.
6. Select the storage location: **Fridge**, **Counter / pantry**, or **Freezer**.
7. Review the value under **Stays fresh for about how many days?** and adjust it as appropriate.
8. Enter how many you purchased.
9. Click **Add to groceries**.

EatMe saves the food and its type, then adds the purchased quantity to your inventory.

**Important:** The size choices currently represent approximate weights of 75 g (Small), 150 g (Medium), and 300 g (Large). The form also uses general starting shelf-life values of 7 days for fridge or pantry storage and 90 days for freezer storage. These are not food-specific recommendations.

Adjust the values based on appropriate storage guidance. Expiration dates are estimates, not guarantees of food safety.

## 4. Viewing and Managing Groceries

### View Your Inventory

Open the **Groceries** tab to see the foods currently recorded in your inventory.

Grocery cards display:

- Food name and type
- Approximate quantity remaining
- Time remaining until the recorded expiration date
- A freshness bar when expiration information is available

Groceries are displayed with the earliest expiration dates first. Items without recorded expiration dates appear last.

Use **Search groceries** to filter the inventory by food name or type.

### View Grocery Details

Click a grocery card to open its detail page.

The page displays information such as:

- Quantity remaining
- Serving size
- Storage location
- Date added
- Expiration date
- Freshness information, when available

### Record Food Usage

When you eat or use part of a grocery:

1. Find the item on **Groceries** or open its detail page.
2. Adjust the slider to select how much you used.
3. Click **Use**. On the detail page, the button displays the selected amount in grams.
4. Alternatively, select **Use one serving** on the detail page if that option is available.

EatMe updates the remaining amount. Once the entire quantity has been used, the grocery is removed from your inventory.

### Remove a Grocery

1. Find the grocery you want to remove.
2. Click **Delete** on its card, or open its detail page and select **Throw away**.
3. Confirm the action.

The current implementation removes a grocery by recording its remaining amount as consumed.

## 5. Managing Saved Foods and Types

Saved foods let you reuse food information when adding groceries in the future.

### Add a Saved Food

1. Open **Settings → Saved foods**.
2. Enter a food name, such as Apple, in the provided field.
3. Click **Add**.

The food will appear in your Saved foods list. You can also use the search field to find existing foods.

### Add a Type of Food

1. Select a food from your Saved foods list.
2. Expand **+ Add a type of [food]**.
3. Enter the type's name, such as Fuji.
4. Enter the weight of one unit and the weight of one serving, both in grams.
5. Choose how the food is used:
   - **Whole pieces:** Foods typically counted individually, such as apples or eggs.
   - **A little at a time:** Foods typically used in portions, such as rice or cheese.
6. Select the usual storage location: **Pantry**, **Fridge**, or **Freezer**.
7. Enter how many days the food typically lasts in that location.
8. Click **Add variant**.

Required fields are marked with an asterisk (*).

For **Whole pieces**, one serving must weigh at least as much as one unit. For **A little at a time**, one serving cannot weigh more than the whole unit or package. These rules help ensure that the entered quantities are consistent.

Select an existing type to view its details, including weight, serving size, counting method, and storage preferences.

### Manage Inventory for a Saved Type

A food type's detail page includes an **In your fridge** section for its associated inventory entries.

From this section, you can:

- Enter a quantity and click **Add to fridge**.
- Enter an amount in grams and click **Use** to record food consumption.
- Open an inventory entry to view its grocery details.

Remember that adding a food or type to Saved foods does not automatically add it to your grocery inventory.

## 6. Using Recipes

The **Recipes** tab lets you organize recipes and compare their ingredient requirements against your recorded groceries.

### Browse Recipes

1. Open the **Recipes** tab.
2. Browse the recipes shown under **Recipes for You**.
3. Use **Search recipes** to find a recipe by name.
4. Select a recipe to view its ingredients and details.

Recipe cards show the number of servings and ingredients.

When a recipe has ingredients, its availability bar uses colored segments to show the proportion of ingredients in each category:

- **Green:** Have enough
- **Yellow:** Have some
- **Red:** Missing

A single recipe may contain multiple colors because some ingredients may be available while others are missing.

### Adjust Recipe Servings

For recipes with ingredients, use the **−** and **+** controls on the recipe card to adjust the serving multiplier.

EatMe updates the displayed servings and ingredient requirements based on the multiplier. The current controls allow multipliers from 1× through 10×.

### Create a Recipe

1. Open the **Recipes** tab.
2. Enter a recipe name in the **New recipe** field.
3. Enter the number of servings.
4. Click **Add**.

EatMe opens the new recipe so you can add its ingredients.

### Add Ingredients to a Recipe

1. Open a recipe you created.
2. Scroll to **Add an ingredient**.
3. Search for and select a saved food type.
4. Enter the **Amount for the whole recipe**.
5. Select the appropriate unit if multiple units are available.
6. Click **Add ingredient**.

The ingredient will appear in the recipe's ingredient list.

If a food is unavailable in the ingredient picker, add it under **Settings → Saved foods** first. Foods already added to the recipe are excluded from the ingredient picker.

### View Your Shopping List

The recipe detail page compares required ingredient amounts with the quantities recorded in your inventory.

Each ingredient may be labeled:

- **Have enough:** You have the required amount.
- **Have some:** You have part of the required amount.
- **Missing:** You do not have the required ingredient.

When ingredients are missing or insufficient, the **Shopping list** shows the additional amounts needed.

Click **Copy list** to copy the list to your clipboard. This feature depends on your browser allowing clipboard access.

**Note:** Ingredient availability is based on your recorded groceries. Remember to update the inventory when you use food.

## 7. Managing Grocery Sharing

The **Sharing** screen allows you to create, view, and revoke sharing permissions associated with other EatMe accounts.

### Find Your User ID

1. Open **Settings → Sharing**.
2. Find **Your user ID** near the top of the page.

You can provide this ID to another EatMe user if they want to create a sharing permission for your account.

### Create a Sharing Permission

1. Open **Settings → Sharing**.
2. Enter the other person's numeric user ID in the **User ID** field.
3. Click **Share**.

After a successful request, the person appears under **Sharing with**.

### Revoke a Sharing Permission

1. Open **Settings → Sharing**.
2. Find the person under **Sharing with**.
3. Click the **✕** beside their entry.

EatMe revokes the sharing permission for that user.

**Current limitation:** The sharing interface supports creating and revoking permissions. However, the current Groceries screen does not request or display another user's shared inventory. Viewing and using shared groceries through the frontend should not be treated as a fully available workflow at this stage.

Only create sharing permissions for accounts you trust.

## 8. Settings and Logging Out

Open **Settings** to access:

- **Saved foods:** Manage foods and their types.
- **Sharing:** Manage sharing permissions.
- **Log out:** End your current session.

If you are using EatMe on a shared computer, click **Log out** when finished.

## 9. Troubleshooting

| Problem | What to Try |
| --- | --- |
| EatMe cannot reach the server | If running locally, check that the backend and database are available. Otherwise, contact the team responsible for the running application. |
| Your login has expired | Log out and log back in. |
| You cannot create an account | Check that all required fields are filled out, the email is valid, the passwords match, and the password is at least 8 characters long. |
| A food is missing from Groceries | Check whether it was only added to Saved foods. Use **Groceries → + Add** to record a purchased quantity. |
| You cannot find a food when adding groceries | Try a shorter search or use the option at the bottom of the Add groceries page to create a new food. |
| A form will not save | Check the required fields and any error message displayed. Some inventory operations require shelf-life information for the food type. |
| An ingredient is unavailable when creating a recipe | Add the food and its type under **Settings → Saved foods** first. |
| Sharing fails | Verify that the numeric user ID belongs to another EatMe account. You cannot share with yourself or create a duplicate active sharing permission. |

If these steps do not resolve the problem, report it using the instructions below.

## 10. Reporting Bugs or Problems

If you encounter a bug, unexpected behavior, or a missing feature, open an issue on the [EatMe GitHub Issues page](https://github.com/erenlin/EatMe/issues).

Include:

1. **Description:** A short explanation of the problem.
2. **Steps to reproduce:** What you did before encountering the issue.
3. **Expected behavior:** What you expected to happen.
4. **Actual behavior:** What happened instead.
5. **Additional information:** Relevant screenshots, error messages, and browser details.

Do not include passwords, authentication tokens, database credentials, or sensitive personal information in public GitHub issues.

## 11. Current Limitations

EatMe is still under development. The following planned features are not currently documented as complete user-facing workflows:

- Barcode-based grocery entry
- Automatic food identification from photos
- Automated expiration notifications
- Viewing and using shared groceries directly through the current frontend

The application currently includes interfaces for manual grocery entry, inventory and expiration tracking, saved food management, recipes, ingredient availability, and sharing permissions.

Actual use of these features depends on the backend and database being available. Expiration information is based on stored shelf-life values and should be treated as an estimate rather than a guarantee of food safety.

For developer instructions and project updates, visit the [EatMe GitHub repository](https://github.com/erenlin/EatMe).