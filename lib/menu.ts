// Menu data lifted from copperac.com (schema.org Menu markup), with typo fixes.
export type MenuItem = { name: string; desc: string; price: string };
export type MenuSection = { name: string; items: MenuItem[] };

export const FOOD_MENU: MenuSection[] = [
  {
    name: "Appetizers",
    items: [
      { name: "Copper Fries", desc: "Natural cut fries drizzled with garlic mayo, hoisin sauce, sriracha, red onions, crushed peanuts, parmesan cheese, and cilantro.", price: "10.00" },
      { name: "Chili Cheese Fries", desc: "Crispy, golden, fries smothered in chili and topped with a generous layer of melted cheese.", price: "8.00" },
      { name: "Beer Battered Onion Rings", desc: "Homemade beer battered and sprinkled with parmesan cheese.", price: "8.00" },
      { name: "Wings", desc: "One pound bone-in, deep fried and breaded, covered in your choice of sauce: BBQ, Garlic Parm, Honey Sriracha, Maple Chili, or Mango Habanero.", price: "13.00" },
      { name: "Spinach and Artichoke Dip", desc: "House-made spinach and artichoke dip served with tortilla chips.", price: "8.00" },
    ],
  },
  {
    name: "Salads",
    items: [
      { name: "Copper Chopped Salad", desc: "Romaine lettuce and mixed greens, red onion, tomato, blue cheese crumbles, asiago cheese, egg, bacon, and grilled chicken, served with housemade ranch.", price: "15.00" },
      { name: "Taco Salad", desc: "Romaine lettuce, shredded American cheese, tomato, red onion, guacamole, tortilla chips. Served with spicy ranch and salsa. Your choice of beef, chicken, or pork.", price: "13.00" },
      { name: "Greek Salad", desc: "Romaine lettuce, feta cheese, red onion, pepperoncinis, kalamata olives, beets and cucumbers. Served with Greek dressing on the side. Add grilled chicken + $5", price: "11.00" },
      { name: "Caesar Salad", desc: "Romaine lettuce, tossed in Caesar dressing, topped with asiago, parmesan cheese, and croutons. Add grilled chicken + $5", price: "9.00" },
    ],
  },
  {
    name: "South of the border",
    items: [
      { name: "Nachos", desc: "Housemade chips, queso, red onions, tomatoes, black olives, jalapenos, lettuce, guacamole, and crema.", price: "16.00" },
      { name: "Tacos", desc: "Three fried corn tortillas, lettuce, onion, tomato, cheese, and crema. Served with chips and salsa.", price: "12.00" },
      { name: "Housemade Tortilla chips and salsa", desc: "extra salsa $2", price: "6.00" },
      { name: "Housemade Tortilla chips and guacamole", desc: "extra guacamole $4", price: "8.00" },
      { name: "Housemade Tortilla chips and queso", desc: "extra queso $4", price: "8.00" },
    ],
  },
  {
    name: "Burgers",
    items: [
      { name: "Copper Burger", desc: "Velveeta cheese, onion, pickle, ketchup, mustard, on a sesame seed bun.", price: "12.00" },
      { name: "PBB", desc: "Peanut butter, spicy jelly, jalapenos, bacon, cheddar cheese, served on a brioche bun.", price: "14.00" },
      { name: "Impossible Burger", desc: "Vegan patty with lettuce, tomato, grilled onions, pickle, garlic mayo, served on a brioche bun. Impossible patty can be substituted for any burger, nacho, or taco + $4", price: "15.00" },
      { name: "Whiskey Burger", desc: "Caramelized onions, smoked gouda, lettuce, blue cheese crumbles, whiskey glaze, served on an brioche bun.", price: "14.00" },
      { name: "Mushroom Swiss Burger", desc: "Swiss cheese saut\u00e9ed mushrooms and onions with mayonnaise served on a brioche bun.", price: "14.00" },
    ],
  },
  {
    name: "Game Day Grub",
    items: [
      { name: "Copper Chicken", desc: "Grilled chicken breast marinated in olive oil, garlic, and rosemary served with lettuce, tomato, red onion, garlic mayo, on a pretzel bun.", price: "13.00" },
      { name: "Fried Chicken", desc: "Fried chicken, hot honey, pickles, on a brioche bun.", price: "12.00" },
      { name: "Detroit Style Loose Burgers", desc: "Two hotdog buns filled with seasoned hamburger meat and topped with coney sauce, mustard and onions. A Detroit favorite!", price: "13.00" },
      { name: "Copper Coneys", desc: "Two Dearborn brand natural casing hot dogs, coney sauce, onions, mustard, on hot dog buns.", price: "12.00" },
      { name: "Corn Dog", desc: "One cornmeal battered and deep fried Dearborn hot dog. add a second corn dog + $3", price: "7.00" },
      { name: "BBQ Pork", desc: "Slow roasted pork shoulder, pickles, coleslaw, and BBQ sauce on a toasted brioche bun.", price: "11.00" },
      { name: "Cheesesteak", desc: "Shaved ribeye, onions, mild peppers, American cheese, A1 sauce, served on baguette.", price: "15.00" },
      { name: "Gouda BLT", desc: "Gouda cheese, garlic mayo, bacon, lettuce, tomato on toasted sourdough.", price: "12.00" },
      { name: "Cuban", desc: "Slow roasted pork, sliced ham, mozzarella cheese, pickles, mustard, served on baguette.", price: "15.00" },
      { name: "Italian", desc: "Capicola, mortadella, ham, salami, lettuce, tomato, mild peppers, mozzarella cheese, Italian dressing, served on baguette.", price: "15.00" },
      { name: "Fried Bologna", desc: "Thin sliced bologna, American cheese, grilled onions, mayo, mustard, on a brioche bun.", price: "9.00" },
      { name: "Chicken Tenders", desc: "Four Hand-breaded chicken strips served with ranch, honey mustard, or bbq sauce.", price: "12.00" },
      { name: "Meatball Sub", desc: "Italian meatballs smothered in marinara sauce and mozzarella cheese. Served on a toasted baguette.", price: "15.00" },
      { name: "Chicago Dog", desc: "Authentic style hot dog with mustard, onion, tomatoes, sweet relish, sports peppers, a pickle spear, and celery salt. Served on a poppyseed hotdog bun.", price: "12.00" },
    ],
  },
  {
    name: "Kids",
    items: [
      { name: "Hot Dog", desc: "", price: "7.00" },
      { name: "Grilled Cheese", desc: "", price: "6.00" },
      { name: "PBJ", desc: "", price: "6.00" },
    ],
  },
  {
    name: "Sides",
    items: [
      { name: "Cup of Soup", desc: "", price: "6.00" },
      { name: "Natural Cut Fries", desc: "", price: "3.00" },
      { name: "Housemade Mac and Cheese", desc: "White cheddar, caramelized onions, and bacon.", price: "4.00" },
      { name: "Caesar Salad", desc: "", price: "4.00" },
      { name: "Greek Salad", desc: "", price: "5.00" },
      { name: "Coleslaw", desc: "", price: "3.00" },
      { name: "Side Salad", desc: "Lettuce, tomato, cucumber, onion, cheese.", price: "4.00" },
      { name: "Better Made Chips", desc: "", price: "1.50" },
    ],
  },
  {
    name: "Cocktails",
    items: [
      { name: "Copper Mule", desc: "Traditional mule made with copper distilled vodka", price: "9.00" },
      { name: "Motown Mule", desc: "Maker\u2019s Mark with Detroit\u2019s famous ginger ale", price: "9.00" },
      { name: "Michigan Mule", desc: "Featuring Grand Traverse Cherry Vodka", price: "9.00" },
      { name: "Marshall Mule", desc: "In honor of our very own City of Hospitality, this version features a refreshing pineapple vodka", price: "9.00" },
      { name: "Great Lakes Iced Tea", desc: "A Pure Michigan twist on an all-time classic", price: "9.00" },
      { name: "Curse of Bobby Layne", desc: "Considered the greatest QB in Lions\u2019 history, as well as one of the greatest drinkers, Bobby Layne led Detroit to three NFL Championships in the 1950\u2019s. Then, the Lions traded him. Legend has it that on his way out, Bobby cursed the Lions, saying they wouldn\u2019t win another championship for another 50 years. And, well\u2026you know how that\u2019s going. So, lift your glass (made with Bobby\u2019s favorite scotch- whisky) and help us lift the curse!", price: "7.00" },
    ],
  },
];

export const BRUNCH_MENU: MenuSection[] = [
  {
    name: "Brunch Entrees",
    items: [
      { name: "Peach Cobbler French Toast Bake", desc: "A sweet peach French toast bake topped with a buttery crumble. Finished with powdered sugar, whipped cream, and fresh peaches. Served with your choice of bacon or sausage.", price: "13.00" },
      { name: "Breakfast Nachos", desc: "Tortilla chips topped with chorizo, shredded cheese, scrambled eggs, red onion, crema, guacamole, and cilantro. Served with a side of salsa.", price: "16.00" },
      { name: "Maple Bacon Smash Burger", desc: "Two beef smash patties, Copper Hash Browns, bacon, cheddar cheese, a sunny-side-up egg, and house-made maple aioli on a brioche bun. Served with fries.", price: "16.00" },
      { name: "Copper Breakfast", desc: "Two eggs* any way, Copper hashbrowns, choice of bacon or sausage and sourdough or wheat toast.", price: "11.00" },
      { name: "Gouda BLT", desc: "Gouda cheese, garlic mayo, bacon, lettuce, and tomato on toasted sourdough. Served with fries or Copper Hash Browns. Add an egg* for $2.", price: "12.00" },
      { name: "Copper Burger", desc: "\u2153 pound of beef with Velveeta cheese, onion, pickles, ketchup, and mustard on a sesame seed bun. Served with fries or Copper Hash Browns. Add an egg* for $2.", price: "12.00" },
      { name: "Fried Bologna Sandwich", desc: "Thinly sliced, grilled bologna, American cheese, grilled onions, mayo and mustard on a brioche bun. Served with fries or Copper Hash Browns. Add an egg* for $2.", price: "9.00" },
      { name: "Copper Fries", desc: "Natural cut fries drizzled with garlic mayo, hoisin sauce, sriracha, red onions, crushed peanuts, and cilantro.", price: "10.00" },
      { name: "Soup", desc: "", price: "6.00" },
      { name: "Wings", desc: "Choice of BBQ, Garlic Parm, Honey Sriracha, Maple Chili, or Mango Habanero.", price: "13.00" },
    ],
  },
  {
    name: "Brunch Sides",
    items: [
      { name: "Two eggs", desc: "", price: "4.00" },
      { name: "Copper Hash browns", desc: "Hash brown patty fried with white cheddar, onion, and spices", price: "3.00" },
      { name: "Toast", desc: "", price: "2.00" },
      { name: "Sausage", desc: "", price: "3.00" },
      { name: "Bacon", desc: "", price: "3.00" },
    ],
  },
  {
    name: "Mimosas",
    items: [
      { name: "Raspberry", desc: "Raspberry vodka, raspberry juice, champagne", price: "8.00" },
      { name: "Peach", desc: "Peach vodka, peach juice, champagne", price: "8.00" },
      { name: "Watermelon", desc: "Watermelon schnapps, watermelon juice, champagne", price: "8.00" },
      { name: "Blood Orange", desc: "Blood orange vodka, blood orange juice, champagne", price: "8.00" },
      { name: "Mimosa or Bloody Flight", desc: "Try all four!", price: "16.00" },
    ],
  },
  {
    name: "Bloody Marys",
    items: [
      { name: "Loaded House Bloody", desc: "House bloody mix, Skyy Vodka", price: "8.00" },
      { name: "Peppar Bloody", desc: "House Bloody mix, Absolut Peppar, Bacon Salt Rim", price: "8.00" },
      { name: "Pickle Bloody", desc: "Housemade bloody mix, Pickle Vodka", price: "8.00" },
      { name: "Horseradish", desc: "House bloody mix, Horseradish Vodka", price: "8.00" },
    ],
  },
  {
    name: "Brunch Cocktails",
    items: [
      { name: "Blood Orange Screwdriver", desc: "Effen Blood Orange Vodka, blood orange, orange juice", price: "8.00" },
      { name: "Campfire Cold Brew", desc: "Skrewball peanut butter whiskey, cold brew and a splash of cream. Finished with chocolate syrup and a toasted marshmallow.", price: "8.00" },
      { name: "Peach Cobbler Coffee", desc: "Baileys, peach schnapps, and hot coffee. Topped with whipped cream, cinnamon sugar, and graham cracker crumble.", price: "8.00" },
      { name: "Beer Mosa", desc: "Ask your server for seasonal options", price: "5.00" },
      { name: "Bloody Beer", desc: "PBR or Bud Light with tomato juice", price: "4.00" },
    ],
  },
  {
    name: "Brunch Shots",
    items: [
      { name: "Mini Espresso Martini Shot", desc: "Vanilla vodka, Bailey's and Kahl\u00faa.", price: "6.00" },
      { name: "Breakfast Shot", desc: "Jameson Triple, maple syrup, buttershots. Chased with orange juice and candied bacon.", price: "7.00" },
      { name: "French Toast Shot", desc: "Butterscotch Schnapps, Fireball, cream, cinnamon-sugar rim", price: "6.00" },
    ],
  },
  {
    name: "Non-Alcoholic Options",
    items: [
      { name: "Coffee", desc: "", price: "2.00" },
      { name: "Coke Products", desc: "", price: "3.00" },
      { name: "Faygo Cans", desc: "", price: "2.00" },
      { name: "Iced Tea and Lemonade", desc: "", price: "3.00" },
      { name: "Vernors", desc: "", price: "2.00" },
    ],
  },
];
