/**
 * Zomato Interactive UI Components
 * Renders MCP tool responses as beautiful Zomato-style UI elements
 */

class ZomatoUI {
    constructor() {
        this.selectedRestaurant = null;
        this.selectedItems = [];
        this.cart = [];
    }

    /**
     * Render restaurant cards from search results
     */
    renderRestaurants(restaurants, location) {
        if (!restaurants || restaurants.length === 0) {
            return '<div class="no-results">No restaurants found. Try a different search.</div>';
        }

        const html = `
            <div class="zomato-section">
                <div class="section-header">
                    <h3>🍽️ Restaurants near ${location || 'you'}</h3>
                    <div class="filters">
                        <button class="filter-chip active" onclick="filterRestaurants('all')">All</button>
                        <button class="filter-chip" onclick="filterRestaurants('rating')">Top Rated</button>
                        <button class="filter-chip" onclick="filterRestaurants('delivery')">Fast Delivery</button>
                        <button class="filter-chip" onclick="filterRestaurants('offers')">Offers</button>
                    </div>
                </div>
                <div class="restaurant-grid" id="restaurantGrid">
                    ${restaurants.map(restaurant => this.renderRestaurantCard(restaurant)).join('')}
                </div>
            </div>
        `;
        return html;
    }

    /**
     * Render individual restaurant card
     */
    renderRestaurantCard(restaurant) {
        const {
            id,
            name,
            cuisine = [],
            rating = 0,
            reviews = 0,
            deliveryTime = 'N/A',
            costForTwo = 0,
            image,
            offers = [],
            distance = '',
            isOpen = true
        } = restaurant;

        const cuisineText = Array.isArray(cuisine) ? cuisine.join(', ') : cuisine;
        const offerText = offers.length > 0 ? offers[0] : null;

        return `
            <div class="restaurant-card ${!isOpen ? 'closed' : ''}" data-id="${id}">
                <div class="restaurant-image" style="background-image: url('${image || 'https://via.placeholder.com/400x250?text=Restaurant'}')">
                    ${!isOpen ? '<div class="closed-badge">CLOSED</div>' : ''}
                    ${offerText ? `<div class="offer-badge">🎁 ${offerText}</div>` : ''}
                    <button class="favorite-btn" onclick="toggleFavorite('${id}')">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                    </button>
                </div>
                <div class="restaurant-info">
                    <div class="restaurant-header">
                        <h4 class="restaurant-name">${name}</h4>
                        <div class="rating-badge ${rating >= 4 ? 'high' : rating >= 3.5 ? 'medium' : 'low'}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                            <span>${rating}</span>
                        </div>
                    </div>
                    <div class="restaurant-meta">
                        <span class="cuisine">${cuisineText}</span>
                        ${distance ? `<span class="distance">• ${distance}</span>` : ''}
                    </div>
                    <div class="restaurant-footer">
                        <div class="delivery-info">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <polyline points="12 6 12 12 16 14"/>
                            </svg>
                            <span>${deliveryTime}</span>
                        </div>
                        <div class="cost-info">
                            <span>₹${costForTwo} for two</span>
                        </div>
                    </div>
                    <button class="view-menu-btn" onclick="viewRestaurantMenu('${id}', '${name}')">
                        View Menu
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="5" y1="12" x2="19" y2="12"/>
                            <polyline points="12 5 19 12 12 19"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render menu items
     */
    renderMenu(menuData, restaurantName) {
        const { categories = [], restaurant } = menuData;

        return `
            <div class="zomato-section menu-section">
                <div class="menu-header">
                    <button class="back-btn" onclick="goBack()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="19" y1="12" x2="5" y2="12"/>
                            <polyline points="12 19 5 12 12 5"/>
                        </svg>
                    </button>
                    <div>
                        <h3>${restaurantName || restaurant?.name || 'Menu'}</h3>
                        <p class="menu-subtitle">${categories.length} categories • ${this.countTotalItems(categories)} items</p>
                    </div>
                    <button class="cart-btn" onclick="viewCart()">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="9" cy="21" r="1"/>
                            <circle cx="20" cy="21" r="1"/>
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                        </svg>
                        ${this.cart.length > 0 ? `<span class="cart-count">${this.cart.length}</span>` : ''}
                    </button>
                </div>
                <div class="menu-filters">
                    <button class="filter-chip active" onclick="filterMenu('all')">All</button>
                    <button class="filter-chip" onclick="filterMenu('veg')">🟢 Veg</button>
                    <button class="filter-chip" onclick="filterMenu('non-veg')">🔴 Non-Veg</button>
                    <button class="filter-chip" onclick="filterMenu('bestseller')">⭐ Bestseller</button>
                </div>
                <div class="menu-content">
                    ${categories.map(category => this.renderCategory(category)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render food category
     */
    renderCategory(category) {
        const { name, items = [] } = category;
        
        return `
            <div class="menu-category">
                <h4 class="category-title">${name} (${items.length})</h4>
                <div class="menu-items">
                    ${items.map(item => this.renderMenuItem(item)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * Render individual menu item
     */
    renderMenuItem(item) {
        const {
            id,
            name,
            description = '',
            price,
            image,
            isVeg = true,
            isBestseller = false,
            rating = 0,
            serves = 1
        } = item;

        return `
            <div class="menu-item" data-id="${id}">
                <div class="item-info">
                    <div class="item-header">
                        <span class="veg-indicator ${isVeg ? 'veg' : 'non-veg'}">
                            <span class="veg-dot"></span>
                        </span>
                        ${isBestseller ? '<span class="bestseller-badge">⭐ Bestseller</span>' : ''}
                    </div>
                    <h5 class="item-name">${name}</h5>
                    <div class="item-price">₹${price}</div>
                    ${description ? `<p class="item-description">${description}</p>` : ''}
                    ${rating > 0 ? `
                        <div class="item-rating">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="#fbbf24">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                            <span>${rating}</span>
                        </div>
                    ` : ''}
                </div>
                ${image ? `
                    <div class="item-image-container">
                        <img src="${image}" alt="${name}" class="item-image" />
                        <button class="add-btn" onclick="addToCart('${id}', '${name}', ${price})">
                            ADD
                        </button>
                    </div>
                ` : `
                    <button class="add-btn simple" onclick="addToCart('${id}', '${name}', ${price})">
                        ADD +
                    </button>
                `}
            </div>
        `;
    }

    /**
     * Render cart
     */
    renderCart(cartData) {
        const { items = [], restaurant, subtotal = 0, deliveryFee = 0, taxes = 0, total = 0 } = cartData;

        if (items.length === 0) {
            return `
                <div class="empty-cart">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <circle cx="9" cy="21" r="1"/>
                        <circle cx="20" cy="21" r="1"/>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                    </svg>
                    <h3>Your cart is empty</h3>
                    <p>Add items from a restaurant to get started</p>
                </div>
            `;
        }

        return `
            <div class="zomato-section cart-section">
                <div class="cart-header">
                    <button class="back-btn" onclick="goBack()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="19" y1="12" x2="5" y2="12"/>
                            <polyline points="12 19 5 12 12 5"/>
                        </svg>
                    </button>
                    <h3>Cart</h3>
                </div>
                <div class="cart-restaurant">
                    <h4>${restaurant?.name || 'Your Order'}</h4>
                    <p>${restaurant?.location || ''}</p>
                </div>
                <div class="cart-items">
                    ${items.map(item => this.renderCartItem(item)).join('')}
                </div>
                <div class="add-more-items">
                    <button class="add-more-btn" onclick="backToMenu()">
                        + Add more items
                    </button>
                </div>
                <div class="bill-details">
                    <h4>Bill Details</h4>
                    <div class="bill-row">
                        <span>Item total</span>
                        <span>₹${subtotal}</span>
                    </div>
                    <div class="bill-row">
                        <span>Delivery fee</span>
                        <span>${deliveryFee > 0 ? `₹${deliveryFee}` : 'FREE'}</span>
                    </div>
                    <div class="bill-row">
                        <span>Taxes & charges</span>
                        <span>₹${taxes}</span>
                    </div>
                    <div class="bill-row total">
                        <span>TO PAY</span>
                        <span>₹${total}</span>
                    </div>
                </div>
                <button class="checkout-btn" onclick="proceedToCheckout()">
                    Proceed to Checkout
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="5" y1="12" x2="19" y2="12"/>
                        <polyline points="12 5 19 12 12 19"/>
                    </svg>
                </button>
            </div>
        `;
    }

    /**
     * Render cart item
     */
    renderCartItem(item) {
        const { id, name, price, quantity = 1, isVeg = true, customizations = [] } = item;

        return `
            <div class="cart-item" data-id="${id}">
                <span class="veg-indicator ${isVeg ? 'veg' : 'non-veg'}">
                    <span class="veg-dot"></span>
                </span>
                <div class="cart-item-info">
                    <h5>${name}</h5>
                    ${customizations.length > 0 ? `<p class="customizations">${customizations.join(', ')}</p>` : ''}
                    <div class="quantity-control">
                        <button class="qty-btn" onclick="updateQuantity('${id}', ${quantity - 1})">−</button>
                        <span class="quantity">${quantity}</span>
                        <button class="qty-btn" onclick="updateQuantity('${id}', ${quantity + 1})">+</button>
                    </div>
                </div>
                <div class="cart-item-price">₹${price * quantity}</div>
            </div>
        `;
    }

    /**
     * Render order confirmation
     */
    renderOrderConfirmation(orderData) {
        const { orderId, restaurant, items, total, estimatedDelivery, deliveryAddress } = orderData;

        return `
            <div class="order-confirmation">
                <div class="success-animation">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="8 12 11 15 16 9"/>
                    </svg>
                </div>
                <h2>Order Placed Successfully!</h2>
                <p class="order-id">Order ID: #${orderId}</p>
                <div class="order-timeline">
                    <div class="timeline-item active">
                        <div class="timeline-dot"></div>
                        <div class="timeline-content">
                            <h4>Order Confirmed</h4>
                            <p>Your order has been placed</p>
                        </div>
                    </div>
                    <div class="timeline-item">
                        <div class="timeline-dot"></div>
                        <div class="timeline-content">
                            <h4>Preparing</h4>
                            <p>Restaurant is preparing food</p>
                        </div>
                    </div>
                    <div class="timeline-item">
                        <div class="timeline-dot"></div>
                        <div class="timeline-content">
                            <h4>Out for Delivery</h4>
                            <p>Delivery partner on the way</p>
                        </div>
                    </div>
                    <div class="timeline-item">
                        <div class="timeline-dot"></div>
                        <div class="timeline-content">
                            <h4>Delivered</h4>
                            <p>Estimated: ${estimatedDelivery}</p>
                        </div>
                    </div>
                </div>
                <div class="order-summary">
                    <h3>Order from ${restaurant.name}</h3>
                    <div class="order-items">
                        ${items.map(item => `<div class="order-item">${item.quantity}x ${item.name}</div>`).join('')}
                    </div>
                    <div class="order-total">Total: ₹${total}</div>
                    <div class="delivery-address">
                        <strong>Delivering to:</strong>
                        <p>${deliveryAddress}</p>
                    </div>
                </div>
                <button class="track-order-btn" onclick="trackOrder('${orderId}')">
                    Track Order
                </button>
            </div>
        `;
    }

    // Helper methods
    countTotalItems(categories) {
        return categories.reduce((total, cat) => total + (cat.items?.length || 0), 0);
    }
}

// Export for use in main app
window.ZomatoUI = new ZomatoUI();
