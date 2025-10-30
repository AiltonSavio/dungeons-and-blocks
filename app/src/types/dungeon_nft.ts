/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/dungeon_nft.json`.
 */
export type DungeonNft = {
  "address": "3ygmxT7u6AVcU8Qjtv6W5fgRUvvmajb9Vst776EeT2uh",
  "metadata": {
    "name": "dungeonNft",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "callbackMintDungeon",
      "discriminator": [
        29,
        82,
        236,
        242,
        71,
        5,
        33,
        49
      ],
      "accounts": [
        {
          "name": "programIdentity",
          "signer": true,
          "address": "9irBy75QS2BN81FUgXuHcjqceJJRuc9oDkAe8TKVvvAw"
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "dungeon",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  110,
                  103,
                  101,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "dungeon.mint_id",
                "account": "dungeonMint"
              }
            ]
          }
        },
        {
          "name": "payer"
        }
      ],
      "args": [
        {
          "name": "randomness",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "initializeConfig",
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "collectionName",
          "type": "string"
        },
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "baseUri",
          "type": "string"
        },
        {
          "name": "gridWidth",
          "type": "u16"
        },
        {
          "name": "gridHeight",
          "type": "u16"
        }
      ]
    },
    {
      "name": "mintDungeon",
      "discriminator": [
        82,
        156,
        80,
        252,
        218,
        167,
        138,
        252
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "dungeon",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  110,
                  103,
                  101,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.next_mint_id",
                "account": "dungeonConfig"
              }
            ]
          }
        },
        {
          "name": "oracleQueue",
          "writable": true,
          "address": "Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh"
        },
        {
          "name": "programIdentity",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  105,
                  100,
                  101,
                  110,
                  116,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "vrfProgram",
          "address": "Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz"
        },
        {
          "name": "slotHashes",
          "address": "SysvarS1otHashes111111111111111111111111111"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "mintDungeonWithSeed",
      "discriminator": [
        151,
        208,
        181,
        62,
        9,
        87,
        163,
        234
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "address": "AXwYStYVryJuZjNJjHHLPp6eVRc2TuESnW1pCMiUYrwV"
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "dungeon",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  117,
                  110,
                  103,
                  101,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "config"
              },
              {
                "kind": "account",
                "path": "config.next_mint_id",
                "account": "dungeonConfig"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "owner",
          "type": "pubkey"
        },
        {
          "name": "seed",
          "type": "u32"
        }
      ]
    },
    {
      "name": "updateConfigGrid",
      "discriminator": [
        6,
        150,
        104,
        5,
        81,
        125,
        227,
        255
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "gridWidth",
          "type": "u16"
        },
        {
          "name": "gridHeight",
          "type": "u16"
        }
      ]
    },
    {
      "name": "updateConfigMetadata",
      "discriminator": [
        208,
        92,
        40,
        171,
        151,
        9,
        20,
        171
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "collectionName",
          "type": "string"
        },
        {
          "name": "symbol",
          "type": "string"
        },
        {
          "name": "baseUri",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "dungeonConfig",
      "discriminator": [
        184,
        220,
        216,
        249,
        250,
        211,
        99,
        227
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
    }
  ],
  "events": [
    {
      "name": "configGridUpdated",
      "discriminator": [
        79,
        22,
        93,
        208,
        138,
        115,
        138,
        174
      ]
    },
    {
      "name": "configInitialized",
      "discriminator": [
        181,
        49,
        200,
        156,
        19,
        167,
        178,
        91
      ]
    },
    {
      "name": "configMetadataUpdated",
      "discriminator": [
        58,
        74,
        112,
        75,
        202,
        25,
        41,
        243
      ]
    },
    {
      "name": "dungeonMintRequested",
      "discriminator": [
        29,
        96,
        195,
        54,
        189,
        148,
        43,
        2
      ]
    },
    {
      "name": "dungeonMintSettled",
      "discriminator": [
        206,
        108,
        188,
        202,
        89,
        50,
        223,
        138
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidGrid",
      "msg": "Unable to fit dungeon data in configured grid"
    },
    {
      "code": 6001,
      "name": "gridTooLarge",
      "msg": "Grid dimensions too large for account space"
    },
    {
      "code": 6002,
      "name": "invalidCollectionName",
      "msg": "Collection name is invalid"
    },
    {
      "code": 6003,
      "name": "invalidSymbol",
      "msg": "Symbol is invalid"
    },
    {
      "code": 6004,
      "name": "invalidUri",
      "msg": "Base URI is invalid"
    },
    {
      "code": 6005,
      "name": "unauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6006,
      "name": "maxSupplyReached",
      "msg": "Max supply reached"
    },
    {
      "code": 6007,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6008,
      "name": "mintAlreadySettled",
      "msg": "Dungeon already settled"
    },
    {
      "code": 6009,
      "name": "invalidRandomness",
      "msg": "Invalid randomness payload"
    },
    {
      "code": 6010,
      "name": "invalidConfigReference",
      "msg": "Invalid configuration reference"
    },
    {
      "code": 6011,
      "name": "gridImmutableAfterMint",
      "msg": "Grid size cannot change after minting begins"
    },
    {
      "code": 6012,
      "name": "unauthorizedSeedAuthority",
      "msg": "Seeded mint authority mismatch"
    }
  ],
  "types": [
    {
      "name": "configGridUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "gridWidth",
            "type": "u16"
          },
          {
            "name": "gridHeight",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "configInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "gridWidth",
            "type": "u16"
          },
          {
            "name": "gridHeight",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "configMetadataUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "dungeonConfig",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "maxSupply",
            "type": "u16"
          },
          {
            "name": "nextMintId",
            "type": "u16"
          },
          {
            "name": "completedMints",
            "type": "u16"
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
            "name": "collectionName",
            "type": "string"
          },
          {
            "name": "collectionSymbol",
            "type": "string"
          },
          {
            "name": "baseUri",
            "type": "string"
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
      "name": "dungeonMintRequested",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "dungeon",
            "type": "pubkey"
          },
          {
            "name": "mintId",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "dungeonMintSettled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "payer",
            "type": "pubkey"
          },
          {
            "name": "dungeon",
            "type": "pubkey"
          },
          {
            "name": "mintId",
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
    }
  ]
};
