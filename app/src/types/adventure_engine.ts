/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/adventure_engine.json`.
 */
export type AdventureEngine = {
  "address": "Hnjoe3f7cZuc47RMytSyBrdpxj6x8SoHQBRfqdwKvxVC",
  "metadata": {
    "name": "adventureEngine",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "beginEncounter",
      "discriminator": [
        245,
        99,
        22,
        79,
        131,
        0,
        159,
        99
      ],
      "accounts": [
        {
          "name": "owner"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "adventure",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  118,
                  101,
                  110,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "adventure.dungeon_mint",
                "account": "adventureSession"
              }
            ]
          }
        },
        {
          "name": "combat",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  109,
                  98,
                  97,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "adventure"
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
      "name": "concludeCombat",
      "discriminator": [
        169,
        140,
        255,
        187,
        71,
        27,
        39,
        229
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "adventure",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  118,
                  101,
                  110,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "adventure.dungeon_mint",
                "account": "adventureSession"
              }
            ]
          }
        },
        {
          "name": "combat",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  109,
                  98,
                  97,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "adventure"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "declineEncounter",
      "discriminator": [
        76,
        245,
        241,
        123,
        40,
        215,
        109,
        28
      ],
      "accounts": [
        {
          "name": "owner"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "adventure",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  118,
                  101,
                  110,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "adventure.dungeon_mint",
                "account": "adventureSession"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "delegateAdventure",
      "docs": [
        "Delegation currently disabled while developing on main chain."
      ],
      "discriminator": [
        180,
        146,
        240,
        11,
        96,
        219,
        78,
        128
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "bufferPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  117,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                249,
                114,
                134,
                167,
                208,
                86,
                63,
                183,
                188,
                99,
                152,
                144,
                10,
                231,
                8,
                168,
                36,
                208,
                87,
                211,
                119,
                34,
                180,
                183,
                202,
                194,
                236,
                47,
                56,
                78,
                77,
                71
              ]
            }
          }
        },
        {
          "name": "delegationRecordPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "delegationMetadataPda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  101,
                  103,
                  97,
                  116,
                  105,
                  111,
                  110,
                  45,
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "account",
                "path": "pda"
              }
            ],
            "program": {
              "kind": "account",
              "path": "delegationProgram"
            }
          }
        },
        {
          "name": "pda",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  118,
                  101,
                  110,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "dungeonMint"
              }
            ]
          }
        },
        {
          "name": "owner"
        },
        {
          "name": "dungeonMint"
        },
        {
          "name": "ownerProgram",
          "address": "Hnjoe3f7cZuc47RMytSyBrdpxj6x8SoHQBRfqdwKvxVC"
        },
        {
          "name": "delegationProgram",
          "address": "DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "dropItem",
      "discriminator": [
        115,
        155,
        141,
        193,
        88,
        244,
        150,
        66
      ],
      "accounts": [
        {
          "name": "owner"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "adventure",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  118,
                  101,
                  110,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "adventure.dungeon_mint",
                "account": "adventureSession"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "itemKey",
          "type": "u8"
        },
        {
          "name": "quantity",
          "type": "u16"
        }
      ]
    },
    {
      "name": "exitAdventure",
      "discriminator": [
        22,
        116,
        253,
        209,
        213,
        254,
        243,
        151
      ],
      "accounts": [
        {
          "name": "owner"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "adventure",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  118,
                  101,
                  110,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "adventure.dungeon_mint",
                "account": "adventureSession"
              }
            ]
          }
        },
        {
          "name": "heroProgram",
          "address": "B8KfNvRUoNbF7FPeuDdZ7nfjPXz6kAex4Pye6GcpLD1E"
        },
        {
          "name": "dungeon"
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
            ],
            "program": {
              "kind": "account",
              "path": "playerEconomyProgram"
            }
          }
        },
        {
          "name": "playerEconomyProgram",
          "address": "8YrnrrGJpPaghXZUQ7Pwz2ST972HqRcxVsAbThPpA5bZ"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "magicProgram",
          "address": "Magic11111111111111111111111111111111111111"
        },
        {
          "name": "magicContext",
          "writable": true,
          "address": "MagicContext1111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "moveHero",
      "discriminator": [
        244,
        56,
        184,
        167,
        104,
        7,
        192,
        200
      ],
      "accounts": [
        {
          "name": "owner"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "adventure",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  118,
                  101,
                  110,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "adventure.dungeon_mint",
                "account": "adventureSession"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "direction",
          "type": {
            "defined": {
              "name": "direction"
            }
          }
        }
      ]
    },
    {
      "name": "openChest",
      "discriminator": [
        143,
        8,
        253,
        123,
        197,
        30,
        173,
        15
      ],
      "accounts": [
        {
          "name": "owner"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "adventure",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  118,
                  101,
                  110,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "adventure.dungeon_mint",
                "account": "adventureSession"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "chestIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "pickupItem",
      "discriminator": [
        227,
        155,
        134,
        52,
        209,
        36,
        82,
        49
      ],
      "accounts": [
        {
          "name": "owner"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "adventure",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  118,
                  101,
                  110,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "adventure.dungeon_mint",
                "account": "adventureSession"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "itemKey",
          "type": "u8"
        },
        {
          "name": "quantity",
          "type": "u16"
        }
      ]
    },
    {
      "name": "processUndelegation",
      "discriminator": [
        196,
        28,
        41,
        206,
        48,
        37,
        51,
        167
      ],
      "accounts": [
        {
          "name": "baseAccount",
          "writable": true
        },
        {
          "name": "buffer"
        },
        {
          "name": "payer",
          "writable": true
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "accountSeeds",
          "type": {
            "vec": "bytes"
          }
        }
      ]
    },
    {
      "name": "setDelegate",
      "docs": [
        "Only writes the delegate key into the account data."
      ],
      "discriminator": [
        242,
        30,
        46,
        76,
        108,
        235,
        128,
        181
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "adventure",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  118,
                  101,
                  110,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "adventure.player",
                "account": "adventureSession"
              },
              {
                "kind": "account",
                "path": "adventure.dungeon_mint",
                "account": "adventureSession"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "delegate",
          "type": {
            "option": "pubkey"
          }
        }
      ]
    },
    {
      "name": "startAdventure",
      "discriminator": [
        244,
        69,
        67,
        24,
        20,
        17,
        219,
        189
      ],
      "accounts": [
        {
          "name": "player",
          "writable": true,
          "signer": true
        },
        {
          "name": "dungeon"
        },
        {
          "name": "adventure",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  118,
                  101,
                  110,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "player"
              },
              {
                "kind": "account",
                "path": "dungeon"
              }
            ]
          }
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
                "path": "player"
              }
            ],
            "program": {
              "kind": "account",
              "path": "playerEconomyProgram"
            }
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "heroProgram",
          "address": "B8KfNvRUoNbF7FPeuDdZ7nfjPXz6kAex4Pye6GcpLD1E"
        },
        {
          "name": "playerEconomyProgram",
          "address": "8YrnrrGJpPaghXZUQ7Pwz2ST972HqRcxVsAbThPpA5bZ"
        }
      ],
      "args": [
        {
          "name": "heroMints",
          "type": {
            "vec": "pubkey"
          }
        },
        {
          "name": "items",
          "type": {
            "vec": {
              "defined": {
                "name": "itemInput"
              }
            }
          }
        }
      ]
    },
    {
      "name": "submitCombatAction",
      "discriminator": [
        12,
        110,
        71,
        69,
        111,
        83,
        24,
        175
      ],
      "accounts": [
        {
          "name": "owner"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "adventure",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  118,
                  101,
                  110,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "adventure.dungeon_mint",
                "account": "adventureSession"
              }
            ]
          }
        },
        {
          "name": "combat",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  109,
                  98,
                  97,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "adventure"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "instruction",
          "type": {
            "defined": {
              "name": "combatInstruction"
            }
          }
        }
      ]
    },
    {
      "name": "swapItem",
      "discriminator": [
        211,
        203,
        91,
        231,
        154,
        167,
        32,
        193
      ],
      "accounts": [
        {
          "name": "owner"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "adventure",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  118,
                  101,
                  110,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "adventure.dungeon_mint",
                "account": "adventureSession"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "dropItemKey",
          "type": "u8"
        },
        {
          "name": "dropQuantity",
          "type": "u16"
        },
        {
          "name": "pickupItemKey",
          "type": "u8"
        },
        {
          "name": "pickupQuantity",
          "type": "u16"
        }
      ]
    },
    {
      "name": "useItem",
      "discriminator": [
        38,
        85,
        191,
        23,
        255,
        151,
        204,
        199
      ],
      "accounts": [
        {
          "name": "owner"
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "adventure",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  100,
                  118,
                  101,
                  110,
                  116,
                  117,
                  114,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "adventure.dungeon_mint",
                "account": "adventureSession"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "itemKey",
          "type": "u8"
        },
        {
          "name": "quantity",
          "type": "u16"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "adventureCombat",
      "discriminator": [
        240,
        15,
        101,
        166,
        194,
        178,
        153,
        124
      ]
    },
    {
      "name": "adventureSession",
      "discriminator": [
        76,
        55,
        90,
        248,
        133,
        229,
        144,
        128
      ]
    },
    {
      "name": "dungeonMint",
      "discriminator": [
        66,
        4,
        228,
        173,
        28,
        67,
        117,
        115
      ]
    },
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
  "errors": [
    {
      "code": 6000,
      "name": "invalidHeroCount",
      "msg": "hero count must be between 1 and 4"
    },
    {
      "code": 6001,
      "name": "duplicateHero",
      "msg": "duplicate hero provided"
    },
    {
      "code": 6002,
      "name": "heroNotOwned",
      "msg": "hero does not belong to player"
    },
    {
      "code": 6003,
      "name": "heroAlreadyActive",
      "msg": "hero is currently active in a different adventure"
    },
    {
      "code": 6004,
      "name": "heroLockOwnerMismatch",
      "msg": "hero state account belongs to a different player"
    },
    {
      "code": 6005,
      "name": "invalidHeroLockAccount",
      "msg": "hero record is invalid"
    },
    {
      "code": 6006,
      "name": "heroUnavailable",
      "msg": "hero is not available for adventures"
    },
    {
      "code": 6007,
      "name": "adventureAlreadyActive",
      "msg": "adventure already active"
    },
    {
      "code": 6008,
      "name": "adventureNotActive",
      "msg": "adventure is not active"
    },
    {
      "code": 6009,
      "name": "adventureOwnerMismatch",
      "msg": "player mismatch for this adventure session"
    },
    {
      "code": 6010,
      "name": "dungeonNotReady",
      "msg": "dungeon is not ready"
    },
    {
      "code": 6011,
      "name": "dungeonSeedMissing",
      "msg": "dungeon seed not initialized"
    },
    {
      "code": 6012,
      "name": "movementOutOfBounds",
      "msg": "movement exceeded dungeon bounds"
    },
    {
      "code": 6013,
      "name": "movementIntoWall",
      "msg": "cannot move into a wall tile"
    },
    {
      "code": 6014,
      "name": "noPortalAtPosition",
      "msg": "no portal available at this position"
    },
    {
      "code": 6015,
      "name": "resetBlocked",
      "msg": "reset is blocked while heroes are inside"
    },
    {
      "code": 6016,
      "name": "heroIndexOutOfRange",
      "msg": "hero index out of range"
    },
    {
      "code": 6017,
      "name": "invalidValidatorAccount",
      "msg": "invalid validator account supplied"
    },
    {
      "code": 6018,
      "name": "unauthorized",
      "msg": "caller is not authorized to perform this action"
    },
    {
      "code": 6019,
      "name": "tooManyItems",
      "msg": "too many items provided (max 6)"
    },
    {
      "code": 6020,
      "name": "invalidItemKey",
      "msg": "invalid item key"
    },
    {
      "code": 6021,
      "name": "invalidItemQuantity",
      "msg": "invalid item quantity"
    },
    {
      "code": 6022,
      "name": "itemStackOverflow",
      "msg": "item stack overflow"
    },
    {
      "code": 6023,
      "name": "inventoryFull",
      "msg": "inventory is full"
    },
    {
      "code": 6024,
      "name": "itemNotFound",
      "msg": "item not found in inventory"
    },
    {
      "code": 6025,
      "name": "insufficientItemQuantity",
      "msg": "insufficient item quantity"
    },
    {
      "code": 6026,
      "name": "noChestAtPosition",
      "msg": "no chest available at this position"
    },
    {
      "code": 6027,
      "name": "chestAlreadyOpened",
      "msg": "chest already opened"
    },
    {
      "code": 6028,
      "name": "lootNotAvailable",
      "msg": "selected loot is not available"
    },
    {
      "code": 6029,
      "name": "dungeonOwnerEconomyMissing",
      "msg": "dungeon owner economy account missing"
    },
    {
      "code": 6030,
      "name": "invalidDungeonAccount",
      "msg": "dungeon account mismatch"
    },
    {
      "code": 6031,
      "name": "combatAlreadyActive",
      "msg": "combat encounter already active"
    },
    {
      "code": 6032,
      "name": "noPendingEncounter",
      "msg": "no combat encounter available to begin"
    },
    {
      "code": 6033,
      "name": "invalidCombatAccount",
      "msg": "combat account mismatch"
    },
    {
      "code": 6034,
      "name": "combatNotActive",
      "msg": "combat encounter is not active"
    },
    {
      "code": 6035,
      "name": "movementBlockedInCombat",
      "msg": "movement is blocked while heroes are in combat"
    },
    {
      "code": 6036,
      "name": "notHeroTurn",
      "msg": "it is not the selected hero's turn"
    },
    {
      "code": 6037,
      "name": "heroNotAlive",
      "msg": "selected hero cannot act (dead or incapacitated)"
    },
    {
      "code": 6038,
      "name": "enemyNotAlive",
      "msg": "selected enemy is not a valid target"
    },
    {
      "code": 6039,
      "name": "insufficientActionPoints",
      "msg": "insufficient action points for ability"
    },
    {
      "code": 6040,
      "name": "invalidTarget",
      "msg": "invalid target index"
    },
    {
      "code": 6041,
      "name": "combatNotResolved",
      "msg": "combat resolution pending"
    },
    {
      "code": 6042,
      "name": "itemNotUsable",
      "msg": "item cannot be used"
    }
  ],
  "types": [
    {
      "name": "adventureCombat",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "adventure",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "active",
            "type": "bool"
          },
          {
            "name": "round",
            "type": "u16"
          },
          {
            "name": "turnCursor",
            "type": "u8"
          },
          {
            "name": "torch",
            "type": "u8"
          },
          {
            "name": "rngState",
            "type": "u64"
          },
          {
            "name": "heroCount",
            "type": "u8"
          },
          {
            "name": "enemyCount",
            "type": "u8"
          },
          {
            "name": "initiativeLen",
            "type": "u8"
          },
          {
            "name": "initiative",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "initiativeSlot"
                  }
                },
                8
              ]
            }
          },
          {
            "name": "heroes",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "heroCombatant"
                  }
                },
                4
              ]
            }
          },
          {
            "name": "enemies",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "enemyCombatant"
                  }
                },
                4
              ]
            }
          },
          {
            "name": "pendingResolution",
            "type": {
              "defined": {
                "name": "combatResolutionState"
              }
            }
          },
          {
            "name": "lootSeed",
            "type": "u64"
          },
          {
            "name": "lastUpdated",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "adventureSession",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "dungeonMint",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "seed",
            "type": "u32"
          },
          {
            "name": "width",
            "type": "u16"
          },
          {
            "name": "height",
            "type": "u16"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "heroesInside",
            "type": "bool"
          },
          {
            "name": "heroCount",
            "type": "u8"
          },
          {
            "name": "heroMints",
            "type": {
              "array": [
                "pubkey",
                4
              ]
            }
          },
          {
            "name": "heroSnapshots",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "heroSnapshot"
                  }
                },
                4
              ]
            }
          },
          {
            "name": "partyPosition",
            "type": {
              "defined": {
                "name": "dungeonPoint"
              }
            }
          },
          {
            "name": "itemCount",
            "type": "u8"
          },
          {
            "name": "items",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "itemSlot"
                  }
                },
                6
              ]
            }
          },
          {
            "name": "pendingLootCount",
            "type": "u8"
          },
          {
            "name": "pendingLootSource",
            "type": "u8"
          },
          {
            "name": "pendingLoot",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "itemSlot"
                  }
                },
                6
              ]
            }
          },
          {
            "name": "delegate",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "grid",
            "type": "bytes"
          },
          {
            "name": "rooms",
            "type": {
              "vec": {
                "defined": {
                  "name": "dungeonRoom"
                }
              }
            }
          },
          {
            "name": "doors",
            "type": {
              "vec": {
                "defined": {
                  "name": "dungeonPoint"
                }
              }
            }
          },
          {
            "name": "chests",
            "type": {
              "vec": {
                "defined": {
                  "name": "dungeonPoint"
                }
              }
            }
          },
          {
            "name": "portals",
            "type": {
              "vec": {
                "defined": {
                  "name": "dungeonPoint"
                }
              }
            }
          },
          {
            "name": "openedChests",
            "type": "bytes"
          },
          {
            "name": "usedPortals",
            "type": "bytes"
          },
          {
            "name": "lastExitPortal",
            "type": "u8"
          },
          {
            "name": "lastExitPosition",
            "type": {
              "defined": {
                "name": "dungeonPoint"
              }
            }
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "lastStartedAt",
            "type": "i64"
          },
          {
            "name": "lastResetAt",
            "type": "i64"
          },
          {
            "name": "lastCrewTimestamp",
            "type": "i64"
          },
          {
            "name": "lastCrewCount",
            "type": "u8"
          },
          {
            "name": "lastCrew",
            "type": {
              "array": [
                "pubkey",
                4
              ]
            }
          },
          {
            "name": "torch",
            "type": "u8"
          },
          {
            "name": "inCombat",
            "type": "bool"
          },
          {
            "name": "combatAccount",
            "type": "pubkey"
          },
          {
            "name": "pendingEncounterSeed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "combatInstruction",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "heroIndex",
            "type": "u8"
          },
          {
            "name": "action",
            "type": {
              "defined": {
                "name": "heroActionKind"
              }
            }
          },
          {
            "name": "target",
            "type": {
              "defined": {
                "name": "targetSelector"
              }
            }
          },
          {
            "name": "itemKey",
            "type": {
              "option": "u8"
            }
          }
        ]
      }
    },
    {
      "name": "combatResolutionState",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "victory"
          },
          {
            "name": "defeat"
          },
          {
            "name": "escape"
          }
        ]
      }
    },
    {
      "name": "combatantKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "none"
          },
          {
            "name": "hero"
          },
          {
            "name": "enemy"
          }
        ]
      }
    },
    {
      "name": "direction",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "north"
          },
          {
            "name": "northEast"
          },
          {
            "name": "east"
          },
          {
            "name": "southEast"
          },
          {
            "name": "south"
          },
          {
            "name": "southWest"
          },
          {
            "name": "west"
          },
          {
            "name": "northWest"
          }
        ]
      }
    },
    {
      "name": "dungeonMetadata",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "name",
            "type": "string"
          },
          {
            "name": "symbol",
            "type": "string"
          },
          {
            "name": "uri",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "dungeonMint",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "config",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "dungeonStatus"
              }
            }
          },
          {
            "name": "mintId",
            "type": "u16"
          },
          {
            "name": "seed",
            "type": "u32"
          },
          {
            "name": "gridWidth",
            "type": "u16"
          },
          {
            "name": "gridHeight",
            "type": "u16"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "metadata",
            "type": {
              "defined": {
                "name": "dungeonMetadata"
              }
            }
          }
        ]
      }
    },
    {
      "name": "dungeonPoint",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "x",
            "type": "u16"
          },
          {
            "name": "y",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "dungeonRoom",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "x",
            "type": "u16"
          },
          {
            "name": "y",
            "type": "u16"
          },
          {
            "name": "w",
            "type": "u16"
          },
          {
            "name": "h",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "dungeonStatus",
      "repr": {
        "kind": "rust"
      },
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "ready"
          }
        ]
      }
    },
    {
      "name": "enemyCombatant",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "alive",
            "type": "bool"
          },
          {
            "name": "ap",
            "type": "u8"
          },
          {
            "name": "hp",
            "type": "u16"
          },
          {
            "name": "maxHp",
            "type": "u16"
          },
          {
            "name": "attack",
            "type": "u16"
          },
          {
            "name": "defense",
            "type": "u16"
          },
          {
            "name": "magic",
            "type": "u16"
          },
          {
            "name": "resistance",
            "type": "u16"
          },
          {
            "name": "speed",
            "type": "u16"
          },
          {
            "name": "luck",
            "type": "u16"
          },
          {
            "name": "statuses",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "statusInstance"
                  }
                },
                4
              ]
            }
          },
          {
            "name": "threat",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "heroActionKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "attack"
          },
          {
            "name": "skill1"
          },
          {
            "name": "skill2"
          },
          {
            "name": "defend"
          },
          {
            "name": "useItem"
          }
        ]
      }
    },
    {
      "name": "heroCombatant",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "heroIndex",
            "type": "u8"
          },
          {
            "name": "alive",
            "type": "bool"
          },
          {
            "name": "ap",
            "type": "u8"
          },
          {
            "name": "hp",
            "type": "u16"
          },
          {
            "name": "maxHp",
            "type": "u16"
          },
          {
            "name": "attack",
            "type": "u16"
          },
          {
            "name": "defense",
            "type": "u16"
          },
          {
            "name": "magic",
            "type": "u16"
          },
          {
            "name": "resistance",
            "type": "u16"
          },
          {
            "name": "speed",
            "type": "u16"
          },
          {
            "name": "luck",
            "type": "u16"
          },
          {
            "name": "stress",
            "type": "u16"
          },
          {
            "name": "killStreak",
            "type": "u8"
          },
          {
            "name": "guard",
            "type": "bool"
          },
          {
            "name": "statuses",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "statusInstance"
                  }
                },
                4
              ]
            }
          },
          {
            "name": "pendingXp",
            "type": "u32"
          },
          {
            "name": "pendingPositiveTraits",
            "type": "u8"
          },
          {
            "name": "pendingNegativeTraits",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "heroSnapshot",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "heroId",
            "type": "u64"
          },
          {
            "name": "heroType",
            "type": "u8"
          },
          {
            "name": "level",
            "type": "u8"
          },
          {
            "name": "experience",
            "type": "u64"
          },
          {
            "name": "maxHp",
            "type": "u8"
          },
          {
            "name": "currentHp",
            "type": "u8"
          },
          {
            "name": "attack",
            "type": "u8"
          },
          {
            "name": "defense",
            "type": "u8"
          },
          {
            "name": "magic",
            "type": "u8"
          },
          {
            "name": "resistance",
            "type": "u8"
          },
          {
            "name": "speed",
            "type": "u8"
          },
          {
            "name": "luck",
            "type": "u8"
          },
          {
            "name": "statusEffects",
            "type": "u8"
          },
          {
            "name": "stress",
            "type": "u16"
          },
          {
            "name": "stressMax",
            "type": "u16"
          },
          {
            "name": "positiveTraits",
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          },
          {
            "name": "negativeTraits",
            "type": {
              "array": [
                "u8",
                3
              ]
            }
          }
        ]
      }
    },
    {
      "name": "initiativeSlot",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "occupantKind",
            "type": {
              "defined": {
                "name": "combatantKind"
              }
            }
          },
          {
            "name": "index",
            "type": "u8"
          },
          {
            "name": "initiativeValue",
            "type": "i16"
          },
          {
            "name": "order",
            "type": "u8"
          },
          {
            "name": "active",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "itemInput",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "itemKey",
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
      "name": "itemSlot",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "itemKey",
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
      "name": "statusEffect",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "none"
          },
          {
            "name": "poison"
          },
          {
            "name": "bleed"
          },
          {
            "name": "burn"
          },
          {
            "name": "chill"
          },
          {
            "name": "guard"
          }
        ]
      }
    },
    {
      "name": "statusInstance",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "effect",
            "type": {
              "defined": {
                "name": "statusEffect"
              }
            }
          },
          {
            "name": "duration",
            "type": "u8"
          },
          {
            "name": "stacks",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "targetSelector",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "none"
          },
          {
            "name": "ally",
            "fields": [
              "u8"
            ]
          },
          {
            "name": "enemy",
            "fields": [
              "u8"
            ]
          }
        ]
      }
    }
  ]
};
