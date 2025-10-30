/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/player_economy.json`.
 */
export type PlayerEconomy = {
  "address": "8YrnrrGJpPaghXZUQ7Pwz2ST972HqRcxVsAbThPpA5bZ",
  "metadata": {
    "name": "playerEconomy",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Shared gold and item economy program"
  },
  "instructions": [
    {
      "name": "buyItem",
      "discriminator": [
        80,
        82,
        193,
        201,
        216,
        27,
        70,
        184
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerEconomy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  101,
                  99,
                  111,
                  110,
                  111,
                  109,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "item",
          "type": {
            "defined": {
              "name": "itemKey"
            }
          }
        },
        {
          "name": "quantity",
          "type": "u16"
        }
      ]
    },
    {
      "name": "consumeItems",
      "discriminator": [
        41,
        7,
        105,
        202,
        234,
        186,
        105,
        235
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "The authority (owner or delegated program) consuming items"
          ],
          "signer": true
        },
        {
          "name": "playerEconomy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  101,
                  99,
                  111,
                  110,
                  111,
                  109,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "player_economy.owner",
                "account": "playerEconomy"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "items",
          "type": {
            "vec": {
              "defined": {
                "name": "itemConsumption"
              }
            }
          }
        }
      ]
    },
    {
      "name": "depositLoot",
      "discriminator": [
        94,
        58,
        98,
        177,
        157,
        48,
        223,
        179
      ],
      "accounts": [
        {
          "name": "authority",
          "docs": [
            "Authority adding loot (player or trusted adventure signer)"
          ],
          "signer": true
        },
        {
          "name": "playerEconomy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  101,
                  99,
                  111,
                  110,
                  111,
                  109,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "player_economy.owner",
                "account": "playerEconomy"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "gold",
          "type": "u64"
        },
        {
          "name": "items",
          "type": {
            "vec": {
              "defined": {
                "name": "lootDepositItem"
              }
            }
          }
        }
      ]
    },
    {
      "name": "grantHourlyGold",
      "discriminator": [
        209,
        229,
        124,
        21,
        172,
        112,
        115,
        169
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "playerEconomy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  101,
                  99,
                  111,
                  110,
                  111,
                  109,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "initializePlayerEconomy",
      "discriminator": [
        229,
        164,
        233,
        147,
        180,
        135,
        222,
        91
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerEconomy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  101,
                  99,
                  111,
                  110,
                  111,
                  109,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "sellItem",
      "discriminator": [
        44,
        114,
        171,
        76,
        76,
        10,
        150,
        246
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerEconomy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  101,
                  99,
                  111,
                  110,
                  111,
                  109,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "item",
          "type": {
            "defined": {
              "name": "itemKey"
            }
          }
        },
        {
          "name": "quantity",
          "type": "u16"
        }
      ]
    },
    {
      "name": "spendGold",
      "discriminator": [
        65,
        44,
        205,
        30,
        154,
        22,
        80,
        58
      ],
      "accounts": [
        {
          "name": "owner",
          "docs": [
            "Signer whose vault gold will be debited."
          ],
          "signer": true
        },
        {
          "name": "playerEconomy",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  108,
                  97,
                  121,
                  101,
                  114,
                  95,
                  101,
                  99,
                  111,
                  110,
                  111,
                  109,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "playerEconomy",
      "discriminator": [
        13,
        211,
        131,
        77,
        0,
        34,
        150,
        149
      ]
    }
  ],
  "events": [
    {
      "name": "goldSpent",
      "discriminator": [
        63,
        214,
        7,
        13,
        23,
        130,
        114,
        162
      ]
    },
    {
      "name": "hourlyGrantClaimed",
      "discriminator": [
        189,
        16,
        196,
        173,
        109,
        32,
        93,
        139
      ]
    },
    {
      "name": "itemConsumed",
      "discriminator": [
        93,
        182,
        173,
        144,
        136,
        37,
        168,
        68
      ]
    },
    {
      "name": "itemPurchased",
      "discriminator": [
        33,
        219,
        12,
        58,
        205,
        48,
        63,
        143
      ]
    },
    {
      "name": "itemSold",
      "discriminator": [
        212,
        37,
        218,
        206,
        120,
        171,
        56,
        230
      ]
    },
    {
      "name": "lootDeposited",
      "discriminator": [
        134,
        156,
        100,
        60,
        74,
        27,
        210,
        100
      ]
    },
    {
      "name": "playerEconomyInitialized",
      "discriminator": [
        185,
        66,
        53,
        68,
        172,
        168,
        200,
        16
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "alreadyInitialized",
      "msg": "Player economy account already initialized"
    },
    {
      "code": 6001,
      "name": "unauthorized",
      "msg": "Unauthorized owner access"
    },
    {
      "code": 6002,
      "name": "invalidQuantity",
      "msg": "Quantity must be greater than zero"
    },
    {
      "code": 6003,
      "name": "invalidSpendAmount",
      "msg": "Unable to spend zero gold"
    },
    {
      "code": 6004,
      "name": "itemNotPurchasable",
      "msg": "Item cannot be purchased"
    },
    {
      "code": 6005,
      "name": "itemNotSellable",
      "msg": "Item cannot be sold"
    },
    {
      "code": 6006,
      "name": "stackLimitExceeded",
      "msg": "Inventory stack limit exceeded"
    },
    {
      "code": 6007,
      "name": "insufficientStock",
      "msg": "Not enough of the requested item"
    },
    {
      "code": 6008,
      "name": "insufficientGold",
      "msg": "Not enough gold available"
    },
    {
      "code": 6009,
      "name": "mathOverflow",
      "msg": "Value overflow detected"
    },
    {
      "code": 6010,
      "name": "grantOnCooldown",
      "msg": "Hourly grant still on cooldown"
    },
    {
      "code": 6011,
      "name": "inventoryOverflow",
      "msg": "Inventory quantity too large"
    },
    {
      "code": 6012,
      "name": "accountNotInitialized",
      "msg": "Player economy account is not initialized"
    }
  ],
  "types": [
    {
      "name": "goldSpent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "remaining",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "hourlyGrantClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "nextAvailableAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "itemConsumed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "item",
            "type": "u8"
          },
          {
            "name": "quantity",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "itemConsumption",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "item",
            "type": {
              "defined": {
                "name": "itemKey"
              }
            }
          },
          {
            "name": "quantity",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "itemKey",
      "repr": {
        "kind": "rust"
      },
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pouchGold"
          },
          {
            "name": "stressTonic"
          },
          {
            "name": "minorTorch"
          },
          {
            "name": "healingSalve"
          },
          {
            "name": "mysteryRelic"
          },
          {
            "name": "calmingIncense"
          },
          {
            "name": "phoenixFeather"
          }
        ]
      }
    },
    {
      "name": "itemPurchased",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "item",
            "type": "u8"
          },
          {
            "name": "quantity",
            "type": "u16"
          },
          {
            "name": "unitPrice",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "itemSold",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "item",
            "type": "u8"
          },
          {
            "name": "quantity",
            "type": "u16"
          },
          {
            "name": "unitPrice",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "lootDepositItem",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "item",
            "type": {
              "defined": {
                "name": "itemKey"
              }
            }
          },
          {
            "name": "quantity",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "lootDeposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "gold",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "playerEconomy",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "gold",
            "type": "u64"
          },
          {
            "name": "lastGrantTs",
            "type": "i64"
          },
          {
            "name": "items",
            "type": {
              "array": [
                "u16",
                7
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                5
              ]
            }
          }
        ]
      }
    },
    {
      "name": "playerEconomyInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
